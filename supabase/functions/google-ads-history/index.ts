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

async function getAccessToken(): Promise<string> {
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
  const rawProjectId = Deno.env.get("BQ_PROJECT_ID")?.trim();
  const rawDatasetId = Deno.env.get("BQ_DATASET_ID")?.trim();
  const rawTableId = Deno.env.get("GOOGLE_ADS_BQ_TABLE_ID")?.trim();

  let projectId = rawProjectId || "";
  let datasetId = rawDatasetId || "";
  let tableId = rawTableId || "";

  const splitRef = (value: string) => value.replace(/`/g, "").split(/[.:]/).filter(Boolean);

  if (tableId && (tableId.includes(".") || tableId.includes(":"))) {
    const parts = splitRef(tableId);
    if (parts.length >= 3) {
      projectId = parts[0];
      datasetId = parts[1];
      tableId = parts[2];
    } else if (parts.length === 2) {
      datasetId = parts[0];
      tableId = parts[1];
    }
  }

  return { projectId, datasetId, tableId };
}

async function queryBigQuery(query: string, accessToken: string): Promise<any[]> {
  const { projectId } = resolveBigQueryTarget();
  
  console.log("Executing BigQuery query:", query.substring(0, 200));
  
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

// Fetch live Google Ads data for a specific date
async function fetchGoogleAdsLiveData(date: string, accessToken: string): Promise<any[]> {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID")?.replace(/-/g, "");

  if (!developerToken || !customerId) {
    console.log("Missing Google Ads credentials, skipping live data fetch");
    return [];
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      segments.date
    FROM campaign
    WHERE segments.date = '${date}'
    AND campaign.status != 'REMOVED'
  `;

  console.log(`Fetching live Google Ads data for ${date}`);

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/v22/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Ads API error:", errorText);
      // Return empty array instead of throwing to allow BQ data to still be returned
      return [];
    }

    const data = await response.json();
    const results: any[] = [];

    if (Array.isArray(data)) {
      for (const batch of data) {
        if (batch.results) {
          for (const result of batch.results) {
            const campaign = result.campaign || {};
            const metrics = result.metrics || {};

            const costMicros = Number(metrics.costMicros || 0);
            const spend = costMicros / 1_000_000;
            const installs = Number(metrics.conversions || 0);
            const impressions = Number(metrics.impressions || 0);
            const clicks = Number(metrics.clicks || 0);

            results.push({
              campaign_name: campaign.name || "",
              impressions,
              clicks,
              spend,
              installs: Math.round(installs),
            });
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Failed to fetch live Google Ads data:", error);
    return [];
  }
}

// Transform live data to daily format
function transformLiveData(liveData: any[], date: string): {
  daily: any;
  campaigns: any[];
  totals: any;
} {
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalInstalls = 0;

  const campaigns = liveData.map(row => {
    totalSpend += row.spend;
    totalImpressions += row.impressions;
    totalClicks += row.clicks;
    totalInstalls += row.installs;

    return {
      campaign_name: row.campaign_name,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      installs: row.installs,
      cpi: row.installs > 0 ? row.spend / row.installs : 0,
    };
  });

  const daily = {
    date,
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    installs: totalInstalls,
  };

  const totals = {
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    installs: totalInstalls,
    cpi: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
    ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
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

    // Google Ads data is synced to BigQuery including today via Windsor.ai - no need to cap
    const bqStartDate = startDate;
    const bqEndDate = endDate;
    const shouldQueryBigQuery = true;

    console.log(`Query range: ${startDate} to ${endDate}, querying BigQuery for full range`);

    const accessToken = await getAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    console.log("Querying Google Ads data from:", fullTable);

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

    const campaignFilter = campaignId ? `AND campaign = '${campaignId}'` : "";

    // Build queries
    const dailyQuery = shouldQueryBigQuery ? `
      SELECT 
        date,
        SUM(spend) as spend,
        CAST(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000 AS INT64) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as installs
      FROM ${fullTable}
      WHERE date BETWEEN '${startDate}' AND '${bqEndDate}'
      ${campaignFilter}
      GROUP BY date
      ORDER BY date
    ` : null;

    const campaignQuery = shouldQueryBigQuery ? `
      SELECT 
        campaign as campaign_name,
        SUM(spend) as spend,
        CAST(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000 AS INT64) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as installs
      FROM ${fullTable}
      WHERE date BETWEEN '${startDate}' AND '${bqEndDate}'
      GROUP BY campaign
      ORDER BY spend DESC
    ` : null;

    // Ad-level query (fault-tolerant - may not have ad_id/ad_name columns)
    const adsQuery = shouldQueryBigQuery ? `
      SELECT 
        ad_id,
        ad_name,
        SUM(spend) as spend,
        CAST(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000 AS INT64) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as installs,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000, 0)) as ctr,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi
      FROM ${fullTable}
      WHERE date BETWEEN '${startDate}' AND '${bqEndDate}'
      AND ad_id IS NOT NULL AND ad_id != ''
      GROUP BY ad_id, ad_name
      ORDER BY spend DESC
      LIMIT 50
    ` : null;

    const totalsQuery = shouldQueryBigQuery ? `
      SELECT 
        SUM(spend) as total_spend,
        CAST(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000 AS INT64) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_installs,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000, 0)) as ctr
      FROM ${fullTable}
      WHERE date BETWEEN '${startDate}' AND '${bqEndDate}'
      ${campaignFilter}
    ` : null;

    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        CAST(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000 AS INT64) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_installs,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SAFE_DIVIDE(SUM(spend), NULLIF(SUM(average_cpm), 0)) * 1000, 0)) as ctr
      FROM ${fullTable}
      WHERE date BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${campaignFilter}
    `;

    // Execute queries in parallel
    const promises: Promise<any>[] = [];
    
    if (shouldQueryBigQuery) {
      promises.push(
        queryBigQuery(dailyQuery!, accessToken),
        queryBigQuery(campaignQuery!, accessToken),
        queryBigQuery(totalsQuery!, accessToken)
      );
    } else {
      promises.push(Promise.resolve([]), Promise.resolve([]), Promise.resolve([]));
    }
    
    promises.push(queryBigQuery(prevTotalsQuery, accessToken));

    const [bqDailyData, bqCampaignData, bqTotalsData, prevTotalsData] = await Promise.all(promises);

    // Fetch ad-level data separately (fault-tolerant)
    let bqAdsData: any[] = [];
    if (shouldQueryBigQuery && adsQuery) {
      try {
        bqAdsData = await queryBigQuery(adsQuery, accessToken);
      } catch (adsError) {
        console.log("Ad-level query failed (columns may not exist):", adsError);
        bqAdsData = [];
      }
    }

    // Process BigQuery data
    let dailyData = bqDailyData.map((row: any) => ({
      date: row.date,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      installs: parseFloat(row.installs) || 0,
    }));

    let campaignData = bqCampaignData.map((row: any) => ({
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      installs: parseFloat(row.installs) || 0,
      cpi: row.installs > 0 ? parseFloat(row.spend) / parseFloat(row.installs) : 0,
    }));

    const adsData = bqAdsData.map((row: any) => ({
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      installs: parseFloat(row.installs) || 0,
      ctr: parseFloat(row.ctr) || 0,
      cpi: parseFloat(row.cpi) || 0,
    }));

    const bqTotals = bqTotalsData[0] || {};
    const totals = {
      spend: parseFloat(bqTotals.total_spend) || 0,
      impressions: parseInt(bqTotals.total_impressions) || 0,
      clicks: parseInt(bqTotals.total_clicks) || 0,
      installs: parseFloat(bqTotals.total_installs) || 0,
      cpi: parseFloat(bqTotals.cpi) || 0,
      ctr: parseFloat(bqTotals.ctr) || 0,
    };

    // Sort campaign data by spend desc
    campaignData.sort((a: any, b: any) => b.spend - a.spend);

    const prevTotals = prevTotalsData[0] || {};

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData,
          campaigns: campaignData,
          ads: adsData,
          totals,
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            impressions: parseInt(prevTotals.total_impressions) || 0,
            clicks: parseInt(prevTotals.total_clicks) || 0,
            installs: parseFloat(prevTotals.total_installs) || 0,
            cpi: parseFloat(prevTotals.cpi) || 0,
            ctr: parseFloat(prevTotals.ctr) || 0,
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
