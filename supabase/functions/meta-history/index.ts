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
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        AVG(cpm) as cpm,
        AVG(cpc) as cpc,
        AVG(ctr) as ctr
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
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        AVG(cpm) as cpm,
        AVG(cpc) as cpc,
        AVG(ctr) as ctr
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
        SUM(clicks) as total_clicks,
        SUM(reach) as total_reach,
        AVG(cpm) as avg_cpm,
        AVG(cpc) as avg_cpc,
        AVG(ctr) as avg_ctr,
        SAFE_DIVIDE(SUM(clicks), SUM(impressions)) as calculated_ctr
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
      ${campaignFilter}
    `;

    // Totals for previous period
    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(reach) as total_reach,
        AVG(cpm) as avg_cpm,
        AVG(cpc) as avg_cpc,
        AVG(ctr) as avg_ctr
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

    // Calculate installs from actions (if available in data)
    // For now, we'll estimate based on typical Meta metrics

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData.map((row) => ({
            date: row.date,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.clicks) || 0,
            reach: parseInt(row.reach) || 0,
            cpm: parseFloat(row.cpm) || 0,
            cpc: parseFloat(row.cpc) || 0,
            ctr: parseFloat(row.ctr) || 0,
          })),
          campaigns: campaignData.map((row) => ({
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.clicks) || 0,
            reach: parseInt(row.reach) || 0,
            cpm: parseFloat(row.cpm) || 0,
            cpc: parseFloat(row.cpc) || 0,
            ctr: parseFloat(row.ctr) || 0,
          })),
          totals: {
            spend: parseFloat(totals.total_spend) || 0,
            impressions: parseInt(totals.total_impressions) || 0,
            clicks: parseInt(totals.total_clicks) || 0,
            reach: parseInt(totals.total_reach) || 0,
            cpm: parseFloat(totals.avg_cpm) || 0,
            cpc: parseFloat(totals.avg_cpc) || 0,
            ctr: parseFloat(totals.calculated_ctr) || 0,
          },
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            impressions: parseInt(prevTotals.total_impressions) || 0,
            clicks: parseInt(prevTotals.total_clicks) || 0,
            reach: parseInt(prevTotals.total_reach) || 0,
            cpm: parseFloat(prevTotals.avg_cpm) || 0,
            cpc: parseFloat(prevTotals.avg_cpc) || 0,
            ctr: parseFloat(prevTotals.avg_ctr) || 0,
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
