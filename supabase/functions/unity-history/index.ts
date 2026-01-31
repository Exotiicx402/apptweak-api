import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get today's date in EST timezone
function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  let projectId = (Deno.env.get("BQ_PROJECT_ID") || "").trim();
  let datasetId = (Deno.env.get("BQ_DATASET_ID") || "").trim();
  let tableId = (Deno.env.get("BQ_TABLE_ID") || "").trim();

  const tableParts = tableId.split(".").filter(Boolean);
  if (tableParts.length === 3) {
    projectId = tableParts[0];
    datasetId = tableParts[1];
    tableId = tableParts[2];
  } else if (tableParts.length === 2) {
    datasetId = tableParts[0];
    tableId = tableParts[1];
  }

  return { projectId, datasetId, tableId };
}

async function queryBigQuery(query: string, accessToken: string): Promise<any[]> {
  const { projectId } = resolveBigQueryTarget();
  
  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        timeoutMs: 30000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigQuery error: ${errorText}`);
  }

  const result = await response.json();
  
  if (!result.rows) {
    return [];
  }

  const fields = result.schema.fields.map((f: any) => f.name);
  return result.rows.map((row: any) => {
    const obj: any = {};
    row.f.forEach((cell: any, index: number) => {
      obj[fields[index]] = cell.v;
    });
    return obj;
  });
}

// Fetch live Unity data for a date range
async function fetchUnityLiveData(startDate: string, endDate: string): Promise<any[]> {
  const orgId = Deno.env.get('UNITY_ORG_ID');
  const keyId = Deno.env.get('UNITY_KEY_ID');
  const secretKey = Deno.env.get('UNITY_SECRET_KEY');

  if (!orgId || !keyId || !secretKey) {
    throw new Error('Missing Unity credentials');
  }

  const basicAuth = btoa(`${keyId}:${secretKey}`);
  
  // Unity API requires end date to be after start date
  const endDateObj = new Date(`${endDate}T00:00:00.000Z`);
  endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
  const endDateStr = endDateObj.toISOString().split('T')[0];
  
  const params = new URLSearchParams({
    start: startDate,
    end: endDateStr,
    scale: 'day',
    format: 'json',
    metrics: 'starts,views,clicks,installs,spend,cpi,ctr,cvr,ecpm',
    breakdowns: 'campaign',
  });

  const gameIds = Deno.env.get('UNITY_GAME_IDS');
  const appIds = Deno.env.get('UNITY_APP_IDS');
  if (gameIds) params.set('gameIds', gameIds);
  if (appIds) params.set('appIds', appIds);

  const url = `https://services.api.unity.com/advertise/stats/v2/organizations/${orgId}/reports/acquisitions?${params}`;
  
  console.log(`Fetching live Unity data for range: ${startDate} to ${endDate}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Accept': 'application/json',
    },
  });

  if (response.status === 204) {
    console.log('No Unity data available (204)');
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unity API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.data || [];
}

// Transform live Unity data to match BigQuery schema
function transformUnityData(unityData: any[]): {
  daily: any[];
  campaigns: any[];
  totals: any;
} {
  const dailyMap = new Map<string, any>();
  const campaignMap = new Map<string, any>();
  let totalSpend = 0;
  let totalInstalls = 0;
  let totalClicks = 0;
  let totalViews = 0;
  let totalStarts = 0;

  for (const row of unityData) {
    const date = (row.timestamp || row.date || '').split('T')[0];
    const spend = row.spend ?? 0;
    const installs = row.installs ?? 0;
    const clicks = row.clicks ?? 0;
    const views = row.views ?? 0;
    const starts = row.starts ?? 0;
    const campaignId = row.campaignId || '';
    const campaignName = row.campaignName || '';

    totalSpend += spend;
    totalInstalls += installs;
    totalClicks += clicks;
    totalViews += views;
    totalStarts += starts;

    // Aggregate by date
    if (date) {
      const existing = dailyMap.get(date) || {
        date,
        spend: 0,
        installs: 0,
        clicks: 0,
        views: 0,
        starts: 0,
      };
      existing.spend += spend;
      existing.installs += installs;
      existing.clicks += clicks;
      existing.views += views;
      existing.starts += starts;
      dailyMap.set(date, existing);
    }

    // Aggregate by campaign
    if (campaignId) {
      const key = campaignId;
      const existing = campaignMap.get(key) || {
        campaign_id: campaignId,
        campaign_name: campaignName,
        spend: 0,
        installs: 0,
        clicks: 0,
        views: 0,
      };
      existing.spend += spend;
      existing.installs += installs;
      existing.clicks += clicks;
      existing.views += views;
      campaignMap.set(key, existing);
    }
  }

  const daily = Array.from(dailyMap.values()).map(d => ({
    ...d,
    cpi: d.installs > 0 ? d.spend / d.installs : 0,
    ctr: d.views > 0 ? d.clicks / d.views : 0,
    cvr: d.clicks > 0 ? d.installs / d.clicks : 0,
  }));

  const campaigns = Array.from(campaignMap.values()).map(c => ({
    ...c,
    cpi: c.installs > 0 ? c.spend / c.installs : 0,
    ctr: c.views > 0 ? c.clicks / c.views : 0,
    cvr: c.clicks > 0 ? c.installs / c.clicks : 0,
  }));

  const totals = {
    spend: totalSpend,
    installs: totalInstalls,
    clicks: totalClicks,
    views: totalViews,
    starts: totalStarts,
    cpi: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
    ctr: totalViews > 0 ? totalClicks / totalViews : 0,
    cvr: totalClicks > 0 ? totalInstalls / totalClicks : 0,
  };

  return { daily, campaigns, totals };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, campaignId } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = getTodayDate();
    const includestoday = endDate >= today;
    const bqEndDate = includestoday ? addDays(today, -1) : endDate;
    const shouldQueryBigQuery = startDate <= bqEndDate;

    console.log(`Query range: ${startDate} to ${endDate}, today: ${today}, includestoday: ${includestoday}`);

    const googleAccessToken = await getGoogleAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    // Calculate previous period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - daysDiff - 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    
    const prevStartStr = prevStart.toISOString().split("T")[0];
    const prevEndStr = prevEnd.toISOString().split("T")[0];

    const campaignFilter = campaignId ? `AND campaign_id = '${campaignId}'` : "";

    // Build queries
    const dailyQuery = shouldQueryBigQuery ? `
      SELECT 
        DATE(timestamp) as date,
        SUM(spend) as spend,
        SUM(installs) as installs,
        SUM(clicks) as clicks,
        SUM(views) as views,
        SUM(starts) as starts,
        AVG(cpi) as cpi,
        AVG(ctr) as ctr,
        AVG(cvr) as cvr,
        AVG(ecpm) as ecpm,
        SUM(d0_ad_revenue) as d0_revenue,
        AVG(d0_total_roas) as d0_roas,
        AVG(d1_retention_rate) as d1_retention,
        AVG(d7_retention_rate) as d7_retention
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${campaignFilter}
      GROUP BY date
      ORDER BY date
    ` : null;

    const campaignQuery = shouldQueryBigQuery ? `
      SELECT 
        campaign_id,
        campaign_name,
        SUM(spend) as spend,
        SUM(installs) as installs,
        SUM(clicks) as clicks,
        SUM(views) as views,
        AVG(cpi) as cpi,
        AVG(ctr) as ctr,
        AVG(cvr) as cvr,
        SUM(d0_ad_revenue) as d0_revenue,
        AVG(d0_total_roas) as d0_roas
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      GROUP BY campaign_id, campaign_name
      ORDER BY spend DESC
    ` : null;

    const countryQuery = shouldQueryBigQuery ? `
      SELECT 
        country,
        SUM(spend) as spend,
        SUM(installs) as installs,
        AVG(cpi) as cpi
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${campaignFilter}
      GROUP BY country
      ORDER BY spend DESC
      LIMIT 20
    ` : null;

    const totalsQuery = shouldQueryBigQuery ? `
      SELECT 
        SUM(spend) as total_spend,
        SUM(installs) as total_installs,
        SUM(clicks) as total_clicks,
        SUM(views) as total_views,
        SUM(starts) as total_starts,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(installs), 0)) as avg_cpi,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(views), 0)) as avg_ctr,
        SAFE_DIVIDE(SUM(installs), NULLIF(SUM(clicks), 0)) as avg_cvr,
        SUM(d0_ad_revenue) as total_d0_revenue,
        AVG(d0_total_roas) as avg_d0_roas,
        AVG(d1_retention_rate) as avg_d1_retention,
        AVG(d7_retention_rate) as avg_d7_retention
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${campaignFilter}
    ` : null;

    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(installs) as total_installs,
        SUM(clicks) as total_clicks,
        SUM(views) as total_views,
        SUM(starts) as total_starts,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(installs), 0)) as avg_cpi,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(views), 0)) as avg_ctr,
        SAFE_DIVIDE(SUM(installs), NULLIF(SUM(clicks), 0)) as avg_cvr,
        SUM(d0_ad_revenue) as total_d0_revenue,
        AVG(d0_total_roas) as avg_d0_roas,
        AVG(d1_retention_rate) as avg_d1_retention,
        AVG(d7_retention_rate) as avg_d7_retention
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${campaignFilter}
    `;

    // Execute queries in parallel
    const promises: Promise<any>[] = [];
    
    if (shouldQueryBigQuery) {
      promises.push(
        queryBigQuery(dailyQuery!, googleAccessToken),
        queryBigQuery(campaignQuery!, googleAccessToken),
        queryBigQuery(countryQuery!, googleAccessToken),
        queryBigQuery(totalsQuery!, googleAccessToken)
      );
    } else {
      promises.push(Promise.resolve([]), Promise.resolve([]), Promise.resolve([]), Promise.resolve([]));
    }
    
    promises.push(queryBigQuery(prevTotalsQuery, googleAccessToken));
    
    // Fetch live data for today if needed
    if (includestoday) {
      promises.push(fetchUnityLiveData(today, today));
    } else {
      promises.push(Promise.resolve([]));
    }

    const [bqDailyData, bqCampaignData, bqCountryData, bqTotalsData, prevTotalsData, liveData] = await Promise.all(promises);

    // Process BigQuery data
    let dailyData = bqDailyData.map((row: any) => ({
      date: row.date,
      spend: parseFloat(row.spend) || 0,
      installs: parseInt(row.installs) || 0,
      clicks: parseInt(row.clicks) || 0,
      views: parseInt(row.views) || 0,
      starts: parseInt(row.starts) || 0,
      cpi: parseFloat(row.cpi) || 0,
      ctr: parseFloat(row.ctr) || 0,
      cvr: parseFloat(row.cvr) || 0,
      ecpm: parseFloat(row.ecpm) || 0,
      d0_revenue: parseFloat(row.d0_revenue) || 0,
      d0_roas: parseFloat(row.d0_roas) || 0,
      d1_retention: parseFloat(row.d1_retention) || 0,
      d7_retention: parseFloat(row.d7_retention) || 0,
    }));

    let campaignData = bqCampaignData.map((row: any) => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend) || 0,
      installs: parseInt(row.installs) || 0,
      clicks: parseInt(row.clicks) || 0,
      views: parseInt(row.views) || 0,
      cpi: parseFloat(row.cpi) || 0,
      ctr: parseFloat(row.ctr) || 0,
      cvr: parseFloat(row.cvr) || 0,
      d0_revenue: parseFloat(row.d0_revenue) || 0,
      d0_roas: parseFloat(row.d0_roas) || 0,
    }));

    const countryData = bqCountryData.map((row: any) => ({
      country: row.country,
      spend: parseFloat(row.spend) || 0,
      installs: parseInt(row.installs) || 0,
      cpi: parseFloat(row.cpi) || 0,
    }));

    const bqTotals = bqTotalsData[0] || {};
    let totals = {
      spend: parseFloat(bqTotals.total_spend) || 0,
      installs: parseInt(bqTotals.total_installs) || 0,
      clicks: parseInt(bqTotals.total_clicks) || 0,
      views: parseInt(bqTotals.total_views) || 0,
      starts: parseInt(bqTotals.total_starts) || 0,
      cpi: parseFloat(bqTotals.avg_cpi) || 0,
      ctr: parseFloat(bqTotals.avg_ctr) || 0,
      cvr: parseFloat(bqTotals.avg_cvr) || 0,
      d0_revenue: parseFloat(bqTotals.total_d0_revenue) || 0,
      d0_roas: parseFloat(bqTotals.avg_d0_roas) || 0,
      d1_retention: parseFloat(bqTotals.avg_d1_retention) || 0,
      d7_retention: parseFloat(bqTotals.avg_d7_retention) || 0,
    };

    // Merge live data for today
    if (liveData && liveData.length > 0) {
      const liveTransformed = transformUnityData(liveData);
      
      // Add today's daily data
      dailyData = [...dailyData, ...liveTransformed.daily];
      
      // Merge campaign data
      for (const liveCampaign of liveTransformed.campaigns) {
        const existing = campaignData.find((c: any) => c.campaign_id === liveCampaign.campaign_id);
        if (existing) {
          existing.spend += liveCampaign.spend;
          existing.installs += liveCampaign.installs;
          existing.clicks += liveCampaign.clicks;
          existing.views += liveCampaign.views;
          existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        } else {
          campaignData.push(liveCampaign);
        }
      }
      
      // Update totals
      totals.spend += liveTransformed.totals.spend;
      totals.installs += liveTransformed.totals.installs;
      totals.clicks += liveTransformed.totals.clicks;
      totals.views += liveTransformed.totals.views;
      totals.starts += liveTransformed.totals.starts;
      totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;
      totals.ctr = totals.views > 0 ? totals.clicks / totals.views : 0;
      totals.cvr = totals.clicks > 0 ? totals.installs / totals.clicks : 0;
      
      console.log(`Added live data for today: spend=${liveTransformed.totals.spend}, installs=${liveTransformed.totals.installs}`);
    }

    // Sort campaign data by spend desc
    campaignData.sort((a: any, b: any) => b.spend - a.spend);

    const prevTotals = prevTotalsData[0] || {};

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData,
          campaigns: campaignData,
          countries: countryData,
          totals,
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            installs: parseInt(prevTotals.total_installs) || 0,
            clicks: parseInt(prevTotals.total_clicks) || 0,
            views: parseInt(prevTotals.total_views) || 0,
            starts: parseInt(prevTotals.total_starts) || 0,
            cpi: parseFloat(prevTotals.avg_cpi) || 0,
            ctr: parseFloat(prevTotals.avg_ctr) || 0,
            cvr: parseFloat(prevTotals.avg_cvr) || 0,
            d0_revenue: parseFloat(prevTotals.total_d0_revenue) || 0,
            d0_roas: parseFloat(prevTotals.avg_d0_roas) || 0,
            d1_retention: parseFloat(prevTotals.avg_d1_retention) || 0,
            d7_retention: parseFloat(prevTotals.avg_d7_retention) || 0,
          },
          dateRange: { startDate, endDate },
          previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
