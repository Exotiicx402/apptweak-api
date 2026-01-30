import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
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
  const rawTableId = Deno.env.get("TIKTOK_BQ_TABLE_ID")?.trim();

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

// Note: TikTok does not have a preview function that we can use for live data
// For now, TikTok will only show BigQuery data (no live today data)
// This is because TikTok data comes from Windsor which syncs periodically

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
    const yesterday = addDays(today, -1);
    const includestoday = endDate >= today;
    
    // For TikTok, we only query BQ data (no live API available)
    // Cap end date at yesterday for BQ query
    const bqEndDate = endDate >= today ? yesterday : endDate;
    // Adjust start date if it's in the future (shouldn't happen but handle gracefully)
    const bqStartDate = startDate > yesterday ? yesterday : startDate;
    // Only skip if the entire range would be invalid
    const shouldQueryBigQuery = bqStartDate <= bqEndDate;

    console.log(`Query range: ${startDate} to ${endDate}, BQ query: ${bqStartDate} to ${bqEndDate}, shouldQuery: ${shouldQueryBigQuery}`);

    // Track if today is in range but we have no live API
    const todayDataUnavailable = includestoday;
    const unavailableReason = includestoday ? "TikTok data syncs daily; today's data will be available tomorrow" : "";

    const accessToken = await getAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    console.log("Querying TikTok data from:", fullTable);

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

    // Daily metrics query
    const dailyQuery = `
      SELECT 
        date,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as installs
      FROM ${fullTable}
      WHERE date BETWEEN '${bqStartDate}' AND '${bqEndDate}'
      ${campaignFilter}
      GROUP BY date
      ORDER BY date
    `;

    // Campaign breakdown query
    const campaignQuery = `
      SELECT 
        campaign as campaign_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(conversions) as installs
      FROM ${fullTable}
      WHERE date BETWEEN '${bqStartDate}' AND '${bqEndDate}'
      GROUP BY campaign
      ORDER BY spend DESC
    `;

    // Totals for current period
    const totalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_installs,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) as ctr
      FROM ${fullTable}
      WHERE date BETWEEN '${bqStartDate}' AND '${bqEndDate}'
      ${campaignFilter}
    `;

    // Totals for previous period
    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_installs,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi,
        SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) as ctr
      FROM ${fullTable}
      WHERE date BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${campaignFilter}
    `;

    // Execute all queries in parallel
    const [dailyData, campaignData, totalsData, prevTotalsData] = await Promise.all([
      queryBigQuery(dailyQuery, accessToken),
      queryBigQuery(campaignQuery, accessToken),
      queryBigQuery(totalsQuery, accessToken),
      queryBigQuery(prevTotalsQuery, accessToken),
    ]);

    const totals = totalsData[0] || {};
    const prevTotals = prevTotalsData[0] || {};

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData.map((row: any) => ({
            date: row.date,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.clicks) || 0,
            installs: parseFloat(row.installs) || 0,
          })),
          campaigns: campaignData.map((row: any) => ({
            campaign_name: row.campaign_name,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.clicks) || 0,
            installs: parseFloat(row.installs) || 0,
            cpi: row.installs > 0 ? parseFloat(row.spend) / parseFloat(row.installs) : 0,
          })),
          totals: {
            spend: parseFloat(totals.total_spend) || 0,
            impressions: parseInt(totals.total_impressions) || 0,
            clicks: parseInt(totals.total_clicks) || 0,
            installs: parseFloat(totals.total_installs) || 0,
            cpi: parseFloat(totals.cpi) || 0,
            ctr: parseFloat(totals.ctr) || 0,
          },
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            impressions: parseInt(prevTotals.total_impressions) || 0,
            clicks: parseInt(prevTotals.total_clicks) || 0,
            installs: parseFloat(prevTotals.total_installs) || 0,
            cpi: parseFloat(prevTotals.cpi) || 0,
            ctr: parseFloat(prevTotals.ctr) || 0,
          },
          dateRange: { startDate, endDate: bqEndDate },
          previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
          todayDataUnavailable,
          unavailableReason,
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
