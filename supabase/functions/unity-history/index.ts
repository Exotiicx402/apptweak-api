import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  let projectId = (Deno.env.get("BQ_PROJECT_ID") || "").trim();
  let datasetId = (Deno.env.get("BQ_DATASET_ID") || "").trim();
  let tableId = (Deno.env.get("BQ_TABLE_ID") || "").trim();

  // If tableId includes dataset/project, prefer parsing from it
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

    const accessToken = await getAccessToken();
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

    // Daily metrics query
    const dailyQuery = `
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
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      ${campaignFilter}
      GROUP BY date
      ORDER BY date
    `;

    // Campaign breakdown query
    const campaignQuery = `
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
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY campaign_id, campaign_name
      ORDER BY spend DESC
    `;

    // Country breakdown query
    const countryQuery = `
      SELECT 
        country,
        SUM(spend) as spend,
        SUM(installs) as installs,
        AVG(cpi) as cpi
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      ${campaignFilter}
      GROUP BY country
      ORDER BY spend DESC
      LIMIT 20
    `;

    // Totals for current period
    const totalsQuery = `
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
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      ${campaignFilter}
    `;

    // Totals for previous period
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

    // Execute all queries in parallel
    const [dailyData, campaignData, countryData, totalsData, prevTotalsData] = await Promise.all([
      queryBigQuery(dailyQuery, accessToken),
      queryBigQuery(campaignQuery, accessToken),
      queryBigQuery(countryQuery, accessToken),
      queryBigQuery(totalsQuery, accessToken),
      queryBigQuery(prevTotalsQuery, accessToken),
    ]);

    const totals = totalsData[0] || {};
    const prevTotals = prevTotalsData[0] || {};

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData.map((row) => ({
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
          })),
          campaigns: campaignData.map((row) => ({
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
          })),
          countries: countryData.map((row) => ({
            country: row.country,
            spend: parseFloat(row.spend) || 0,
            installs: parseInt(row.installs) || 0,
            cpi: parseFloat(row.cpi) || 0,
          })),
          totals: {
            spend: parseFloat(totals.total_spend) || 0,
            installs: parseInt(totals.total_installs) || 0,
            clicks: parseInt(totals.total_clicks) || 0,
            views: parseInt(totals.total_views) || 0,
            starts: parseInt(totals.total_starts) || 0,
            cpi: parseFloat(totals.avg_cpi) || 0,
            ctr: parseFloat(totals.avg_ctr) || 0,
            cvr: parseFloat(totals.avg_cvr) || 0,
            d0_revenue: parseFloat(totals.total_d0_revenue) || 0,
            d0_roas: parseFloat(totals.avg_d0_roas) || 0,
            d1_retention: parseFloat(totals.avg_d1_retention) || 0,
            d7_retention: parseFloat(totals.avg_d7_retention) || 0,
          },
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
