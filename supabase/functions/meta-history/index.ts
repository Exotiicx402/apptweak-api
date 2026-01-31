import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function isWithinLastNDays(dateStr: string, n: number): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  const diffMs = today.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= n && diffDays >= 0;
}

function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
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
  const fullTableId = Deno.env.get("META_BQ_TABLE_ID") ?? "";
  const parts = fullTableId.split(".");

  if (parts.length === 3) {
    return { projectId: parts[0], datasetId: parts[1], tableId: parts[2] };
  } else if (parts.length === 2) {
    return {
      projectId: Deno.env.get("BQ_PROJECT_ID") ?? "",
      datasetId: parts[0],
      tableId: parts[1],
    };
  } else {
    return {
      projectId: Deno.env.get("BQ_PROJECT_ID") ?? "",
      datasetId: Deno.env.get("BQ_DATASET_ID") ?? "",
      tableId: fullTableId,
    };
  }
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

// Fetch live data from Meta API for a specific date (same logic as meta-preview)
async function fetchMetaInsights(date: string): Promise<any[]> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!accessToken || !adAccountId) {
    throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID");
  }

  if (!adAccountId.startsWith("act_")) {
    adAccountId = `act_${adAccountId}`;
  }

  const fields = [
    "campaign_id",
    "campaign_name",
    "impressions",
    "clicks",
    "spend",
    "reach",
    "cpm",
    "cpc",
    "ctr",
    "actions",
  ].join(",");

  const timeRange = JSON.stringify({
    since: date,
    until: date,
  });

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
  url.searchParams.set("access_token", accessToken);

  console.log(`Fetching live Meta data for date: ${date}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meta API error:", errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  return data.data || [];
}

function filterAppInstallCampaigns(campaigns: any[]): any[] {
  return campaigns.filter(
    (c) => c.campaign_name?.toUpperCase().includes("APP INSTALLS")
  );
}

// Transform live Meta data to match BigQuery format
function transformLiveData(liveData: any[], date: string): {
  daily: any;
  campaigns: any[];
} {
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalReach = 0;
  let totalInstalls = 0;

  const campaigns = liveData.map((row) => {
    const spend = parseFloat(row.spend) || 0;
    const impressions = parseInt(row.impressions) || 0;
    const clicks = parseInt(row.clicks) || 0;
    const reach = parseInt(row.reach) || 0;
    
    // Extract installs from actions array
    let installs = 0;
    if (row.actions && Array.isArray(row.actions)) {
      const installAction = row.actions.find(
        (a: any) => a.action_type === "mobile_app_install"
      );
      if (installAction) {
        installs = parseInt(installAction.value) || 0;
      }
    }

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalReach += reach;
    totalInstalls += installs;

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend,
      impressions,
      clicks,
      reach,
      cpm: parseFloat(row.cpm) || 0,
      cpc: parseFloat(row.cpc) || 0,
      ctr: parseFloat(row.ctr) || 0,
      installs,
      cpi: installs > 0 ? spend / installs : 0,
    };
  });

  const daily = {
    date,
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    reach: totalReach,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    installs: totalInstalls,
    cpi: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
  };

  return { daily, campaigns };
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
    
    // Determine BigQuery date range (exclude today if present)
    const bqEndDate = includestoday ? 
      new Date(new Date(today).getTime() - 86400000).toISOString().split("T")[0] : 
      endDate;
    const shouldQueryBigQuery = startDate <= bqEndDate;

    console.log(`Query range: ${startDate} to ${endDate}, today: ${today}, includestoday: ${includestoday}`);

    const googleAccessToken = await getGoogleAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    // Calculate previous period for comparison
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

    // Build queries - only include APP INSTALLS campaigns
    const appInstallsFilter = "AND UPPER(campaign_name) LIKE '%APP INSTALLS%'";
    
    const dailyQuery = shouldQueryBigQuery ? `
      SELECT 
        DATE(timestamp) as date,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        AVG(cpm) as cpm,
        AVG(cpc) as cpc,
        AVG(ctr) as ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as installs
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${appInstallsFilter}
      ${campaignFilter}
      GROUP BY date
      ORDER BY date
    ` : null;

    const campaignQuery = shouldQueryBigQuery ? `
      SELECT 
        campaign_id,
        campaign_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        AVG(cpm) as cpm,
        AVG(cpc) as cpc,
        AVG(ctr) as ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as installs
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${appInstallsFilter}
      GROUP BY campaign_id, campaign_name
      ORDER BY spend DESC
    ` : null;

    const totalsQuery = shouldQueryBigQuery ? `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(reach) as total_reach,
        AVG(cpm) as avg_cpm,
        AVG(cpc) as avg_cpc,
        AVG(ctr) as avg_ctr,
        SAFE_DIVIDE(SUM(clicks), SUM(impressions)) as calculated_ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_installs
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${appInstallsFilter}
      ${campaignFilter}
    ` : null;

    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(reach) as total_reach,
        AVG(cpm) as avg_cpm,
        AVG(cpc) as avg_cpc,
        AVG(ctr) as avg_ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_installs
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${appInstallsFilter}
      ${campaignFilter}
    `;

    // Query to check which dates have data in BigQuery for previous period
    const prevDatesQuery = `
      SELECT DISTINCT DATE(timestamp) as date
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${appInstallsFilter}
    `;

    // Execute queries in parallel
    const promises: Promise<any>[] = [];
    
    if (shouldQueryBigQuery) {
      promises.push(
        queryBigQuery(dailyQuery!, googleAccessToken),
        queryBigQuery(campaignQuery!, googleAccessToken),
        queryBigQuery(totalsQuery!, googleAccessToken)
      );
    } else {
      promises.push(
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([])
      );
    }
    
    promises.push(queryBigQuery(prevTotalsQuery, googleAccessToken));
    promises.push(queryBigQuery(prevDatesQuery, googleAccessToken));
    
    // Fetch live data for today if needed
    if (includestoday) {
      promises.push(fetchMetaInsights(today));
    } else {
      promises.push(Promise.resolve([]));
    }

    let [bqDailyData, bqCampaignData, bqTotalsData, prevTotalsData, prevDatesData, liveData] = await Promise.all(promises);

    // Check if BigQuery is missing previous period data - fall back to live API
    const prevRequestedDates = getDatesBetween(prevStartStr, prevEndStr);
    const prevBqDatesFound = new Set((prevDatesData || []).map((row: any) => row.date?.split("T")[0] || row.date));
    const prevMissingDates = prevRequestedDates.filter(d => !prevBqDatesFound.has(d));

    if (prevMissingDates.length > 0) {
      console.log(`BigQuery missing previous period data for ${prevMissingDates.length} dates: ${prevMissingDates.join(", ")}. Fetching from live API...`);
      
      // Fetch missing previous dates from live Meta API
      const prevMissingDataPromises = prevMissingDates.map(async (date) => {
        try {
          const rawLiveData = await fetchMetaInsights(date);
          const liveDayData = filterAppInstallCampaigns(rawLiveData);
          console.log(`Previous period live fallback for ${date}: filtered to ${liveDayData.length} APP INSTALLS from ${rawLiveData.length} total`);
          return { date, data: liveDayData };
        } catch (err) {
          console.error(`Failed to fetch live data for previous period ${date}:`, err);
          return { date, data: [] };
        }
      });
      
      const prevMissingResults = await Promise.all(prevMissingDataPromises);
      
      // Aggregate the previous period live data into totals
      for (const { date, data } of prevMissingResults) {
        if (data.length > 0) {
          const transformed = transformLiveData(data, date);
          
          // Initialize prevTotalsData if empty
          if (!prevTotalsData[0]) {
            prevTotalsData[0] = {
              total_spend: 0,
              total_impressions: 0,
              total_clicks: 0,
              total_reach: 0,
              total_installs: 0,
              avg_cpm: 0,
              avg_cpc: 0,
              avg_ctr: 0,
            };
          }
          
          prevTotalsData[0].total_spend = (parseFloat(prevTotalsData[0].total_spend) || 0) + transformed.daily.spend;
          prevTotalsData[0].total_impressions = (parseInt(prevTotalsData[0].total_impressions) || 0) + transformed.daily.impressions;
          prevTotalsData[0].total_clicks = (parseInt(prevTotalsData[0].total_clicks) || 0) + transformed.daily.clicks;
          prevTotalsData[0].total_reach = (parseInt(prevTotalsData[0].total_reach) || 0) + transformed.daily.reach;
          prevTotalsData[0].total_installs = (parseInt(prevTotalsData[0].total_installs) || 0) + transformed.daily.installs;
          
          console.log(`Added previous period live data for ${date}: spend=${transformed.daily.spend}, installs=${transformed.daily.installs}`);
        }
      }
    }

    // Check if BigQuery returned no data for recent dates - fall back to live API
    const requestedDates = getDatesBetween(startDate, bqEndDate);
    const bqDatesFound = new Set(bqDailyData.map((row: any) => row.date?.split("T")[0] || row.date));
    const missingDates = requestedDates.filter(d => !bqDatesFound.has(d) && isWithinLastNDays(d, 7));

    if (missingDates.length > 0 && shouldQueryBigQuery) {
      console.log(`BigQuery missing data for ${missingDates.length} recent dates: ${missingDates.join(", ")}. Fetching from live API...`);
      
      // Fetch missing dates from live Meta API
      const missingDataPromises = missingDates.map(async (date) => {
        try {
          const rawLiveData = await fetchMetaInsights(date);
          const liveDayData = filterAppInstallCampaigns(rawLiveData);
          console.log(`Live fallback for ${date}: filtered to ${liveDayData.length} APP INSTALLS from ${rawLiveData.length} total`);
          return { date, data: liveDayData };
        } catch (err) {
          console.error(`Failed to fetch live data for ${date}:`, err);
          return { date, data: [] };
        }
      });
      
      const missingResults = await Promise.all(missingDataPromises);
      
      // Transform and merge missing data
      for (const { date, data } of missingResults) {
        if (data.length > 0) {
          const transformed = transformLiveData(data, date);
          
          // Add to daily data
          bqDailyData.push({
            date,
            spend: transformed.daily.spend,
            impressions: transformed.daily.impressions,
            clicks: transformed.daily.clicks,
            reach: transformed.daily.reach,
            cpm: transformed.daily.cpm,
            cpc: transformed.daily.cpc,
            ctr: transformed.daily.ctr,
            installs: transformed.daily.installs,
          });
          
          // Add to campaign data
          for (const camp of transformed.campaigns) {
            const existing = bqCampaignData.find((c: any) => c.campaign_id === camp.campaign_id);
            if (existing) {
              existing.spend = (parseFloat(existing.spend) || 0) + camp.spend;
              existing.impressions = (parseInt(existing.impressions) || 0) + camp.impressions;
              existing.clicks = (parseInt(existing.clicks) || 0) + camp.clicks;
              existing.reach = (parseInt(existing.reach) || 0) + camp.reach;
              existing.installs = (parseInt(existing.installs) || 0) + camp.installs;
            } else {
              bqCampaignData.push({
                campaign_id: camp.campaign_id,
                campaign_name: camp.campaign_name,
                spend: camp.spend,
                impressions: camp.impressions,
                clicks: camp.clicks,
                reach: camp.reach,
                cpm: camp.cpm,
                cpc: camp.cpc,
                ctr: camp.ctr,
                installs: camp.installs,
              });
            }
          }
          
          // Update totals
          if (!bqTotalsData[0]) {
            bqTotalsData[0] = {
              total_spend: 0,
              total_impressions: 0,
              total_clicks: 0,
              total_reach: 0,
              total_installs: 0,
            };
          }
          bqTotalsData[0].total_spend = (parseFloat(bqTotalsData[0].total_spend) || 0) + transformed.daily.spend;
          bqTotalsData[0].total_impressions = (parseInt(bqTotalsData[0].total_impressions) || 0) + transformed.daily.impressions;
          bqTotalsData[0].total_clicks = (parseInt(bqTotalsData[0].total_clicks) || 0) + transformed.daily.clicks;
          bqTotalsData[0].total_reach = (parseInt(bqTotalsData[0].total_reach) || 0) + transformed.daily.reach;
          bqTotalsData[0].total_installs = (parseInt(bqTotalsData[0].total_installs) || 0) + transformed.daily.installs;
          
          console.log(`Added live fallback data for ${date}: spend=${transformed.daily.spend}, installs=${transformed.daily.installs}`);
        }
      }
    }

    // Process BigQuery data
    let dailyData = bqDailyData.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      return {
        date: row.date?.split("T")[0] || row.date,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        reach: parseInt(row.reach) || 0,
        cpm: parseFloat(row.cpm) || 0,
        cpc: parseFloat(row.cpc) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
      };
    });

    let campaignData = bqCampaignData.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      return {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        reach: parseInt(row.reach) || 0,
        cpm: parseFloat(row.cpm) || 0,
        cpc: parseFloat(row.cpc) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
      };
    });

    const bqTotals = bqTotalsData[0] || {};
    let totals = {
      spend: parseFloat(bqTotals.total_spend) || 0,
      impressions: parseInt(bqTotals.total_impressions) || 0,
      clicks: parseInt(bqTotals.total_clicks) || 0,
      reach: parseInt(bqTotals.total_reach) || 0,
      cpm: parseFloat(bqTotals.avg_cpm) || 0,
      cpc: parseFloat(bqTotals.avg_cpc) || 0,
      ctr: parseFloat(bqTotals.calculated_ctr) || 0,
      installs: parseInt(bqTotals.total_installs) || 0,
      cpi: 0,
    };
    totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;

    // Merge live data for today (filter to APP INSTALLS campaigns)
    const filteredLiveData = filterAppInstallCampaigns(liveData);
    if (includestoday && filteredLiveData.length > 0) {
      console.log(`Live today: filtered to ${filteredLiveData.length} APP INSTALLS from ${liveData.length} total`);
      const liveTransformed = transformLiveData(filteredLiveData, today);
      
      // Add today's daily data
      dailyData.push(liveTransformed.daily);
      
      // Merge campaign data
      for (const liveCampaign of liveTransformed.campaigns) {
        const existing = campaignData.find((c: any) => c.campaign_id === liveCampaign.campaign_id);
        if (existing) {
          existing.spend += liveCampaign.spend;
          existing.impressions += liveCampaign.impressions;
          existing.clicks += liveCampaign.clicks;
          existing.reach += liveCampaign.reach;
          existing.installs += liveCampaign.installs;
          existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        } else {
          campaignData.push(liveCampaign);
        }
      }
      
      // Update totals
      totals.spend += liveTransformed.daily.spend;
      totals.impressions += liveTransformed.daily.impressions;
      totals.clicks += liveTransformed.daily.clicks;
      totals.reach += liveTransformed.daily.reach;
      totals.installs += liveTransformed.daily.installs;
      totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;
      totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
      totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
      totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
      
      console.log(`Added live data for today: spend=${liveTransformed.daily.spend}, installs=${liveTransformed.daily.installs}`);
    }

    // Sort daily data by date
    dailyData.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

    // Sort campaign data by spend desc
    campaignData.sort((a: any, b: any) => b.spend - a.spend);

    const prevTotals = prevTotalsData[0] || {};

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData,
          campaigns: campaignData,
          totals,
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            impressions: parseInt(prevTotals.total_impressions) || 0,
            clicks: parseInt(prevTotals.total_clicks) || 0,
            reach: parseInt(prevTotals.total_reach) || 0,
            cpm: parseFloat(prevTotals.avg_cpm) || 0,
            cpc: parseFloat(prevTotals.avg_cpc) || 0,
            ctr: parseFloat(prevTotals.avg_ctr) || 0,
            installs: parseInt(prevTotals.total_installs) || 0,
            cpi: parseInt(prevTotals.total_installs) > 0 ? parseFloat(prevTotals.total_spend) / parseInt(prevTotals.total_installs) : 0,
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
