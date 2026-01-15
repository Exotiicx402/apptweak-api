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
  const rawProjectId = Deno.env.get("BQ_PROJECT_ID")?.trim();
  const rawDatasetId = Deno.env.get("BQ_DATASET_ID")?.trim();
  const rawTableId = Deno.env.get("SNAPCHAT_BQ_TABLE_ID")?.trim();

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
        SUM(impressions) as impressions,
        SUM(swipes) as swipes,
        SUM(video_views) as video_views,
        SUM(total_installs) as installs,
        SUM(view_completion) as view_completion,
        SUM(quartile_1) as quartile_1,
        SUM(quartile_2) as quartile_2,
        SUM(quartile_3) as quartile_3
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
        SUM(impressions) as impressions,
        SUM(swipes) as swipes,
        SUM(video_views) as video_views,
        SUM(total_installs) as installs,
        SUM(view_completion) as view_completion
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY campaign_id, campaign_name
      ORDER BY spend DESC
    `;

    // Totals for current period
    const totalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(swipes) as total_swipes,
        SUM(video_views) as total_video_views,
        SUM(total_installs) as total_installs,
        SUM(view_completion) as total_view_completion,
        SAFE_DIVIDE(SUM(swipes), SUM(impressions)) as swipe_rate,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      ${campaignFilter}
    `;

    // Totals for previous period
    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(swipes) as total_swipes,
        SUM(video_views) as total_video_views,
        SUM(total_installs) as total_installs,
        SUM(view_completion) as total_view_completion,
        SAFE_DIVIDE(SUM(swipes), SUM(impressions)) as swipe_rate,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
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
          daily: dailyData.map((row) => ({
            date: row.date,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            swipes: parseInt(row.swipes) || 0,
            video_views: parseInt(row.video_views) || 0,
            installs: parseInt(row.installs) || 0,
            view_completion: parseInt(row.view_completion) || 0,
            quartile_1: parseInt(row.quartile_1) || 0,
            quartile_2: parseInt(row.quartile_2) || 0,
            quartile_3: parseInt(row.quartile_3) || 0,
          })),
          campaigns: campaignData.map((row) => ({
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            swipes: parseInt(row.swipes) || 0,
            video_views: parseInt(row.video_views) || 0,
            installs: parseInt(row.installs) || 0,
            view_completion: parseInt(row.view_completion) || 0,
          })),
          totals: {
            spend: parseFloat(totals.total_spend) || 0,
            impressions: parseInt(totals.total_impressions) || 0,
            swipes: parseInt(totals.total_swipes) || 0,
            video_views: parseInt(totals.total_video_views) || 0,
            installs: parseInt(totals.total_installs) || 0,
            view_completion: parseInt(totals.total_view_completion) || 0,
            swipe_rate: parseFloat(totals.swipe_rate) || 0,
            cpi: parseFloat(totals.cpi) || 0,
          },
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            impressions: parseInt(prevTotals.total_impressions) || 0,
            swipes: parseInt(prevTotals.total_swipes) || 0,
            video_views: parseInt(prevTotals.total_video_views) || 0,
            installs: parseInt(prevTotals.total_installs) || 0,
            view_completion: parseInt(prevTotals.total_view_completion) || 0,
            swipe_rate: parseFloat(prevTotals.swipe_rate) || 0,
            cpi: parseFloat(prevTotals.cpi) || 0,
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
