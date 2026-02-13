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

// Manual overrides for dates where BigQuery sync is lagging
const MANUAL_OVERRIDES: Record<string, { spend: number; installs: number; cpi: number }> = {
  "2026-02-11": { spend: 1412.20, installs: 172, cpi: 8.21 },
  "2026-02-12": { spend: 444.00, installs: 49, cpi: 9.06 },
};

// google_Final schema:
// account_name, ad_group_name, ad_group_type, average_cpm, campaign, campaign_type,
// clicks, conversions, cpc, ctr, datasource, date, source, spend
// No impressions column — derive from spend/average_cpm * 1000
// No asset_name column — use ad_group_name for breakdowns

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, campaignId, _diagnostic } = body;

    if (_diagnostic) {
      const accessToken = await getAccessToken();
      const { projectId, datasetId, tableId } = resolveBigQueryTarget();
      const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;
      const schemaQuery = `SELECT column_name, data_type FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = '${tableId}' ORDER BY ordinal_position`;
      let schema: any[] = [];
      try { schema = await queryBigQuery(schemaQuery, accessToken); } catch (e) { console.error("Schema query failed:", e); }
      const sampleQuery = `SELECT * FROM ${fullTable} WHERE date = '${startDate}' LIMIT 5`;
      let sample: any[] = [];
      try { sample = await queryBigQuery(sampleQuery, accessToken); } catch (e) { console.error("Sample query failed:", e); }
      return new Response(JSON.stringify({ schema, sample, table: `${projectId}.${datasetId}.${tableId}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Query range: ${startDate} to ${endDate}`);

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

    // CTE to deduplicate exact duplicate rows in google_Final table
    const dedup = (dateFilter: string, extraFilter: string = "") => `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE ${dateFilter}
        ${extraFilter}
      )
      SELECT * FROM deduped WHERE rn = 1
    `;

    const dailyQuery = `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE date BETWEEN '${startDate}' AND '${endDate}'
        ${campaignFilter}
      )
      SELECT 
        date,
        SUM(CAST(spend AS FLOAT64)) as spend,
        CAST(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000 AS INT64) as impressions,
        SUM(CAST(clicks AS INT64)) as clicks,
        SUM(CAST(conversions AS FLOAT64)) as installs
      FROM deduped WHERE rn = 1
      GROUP BY date
      ORDER BY date
    `;

    const campaignQuery = `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE date BETWEEN '${startDate}' AND '${endDate}'
      )
      SELECT 
        campaign as campaign_name,
        SUM(CAST(spend AS FLOAT64)) as spend,
        CAST(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000 AS INT64) as impressions,
        SUM(CAST(clicks AS INT64)) as clicks,
        SUM(CAST(conversions AS FLOAT64)) as installs
      FROM deduped WHERE rn = 1
      GROUP BY campaign
      ORDER BY spend DESC
    `;

    // Ad-group level breakdown for creative reporting
    const adsQuery = `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE date BETWEEN '${startDate}' AND '${endDate}'
        AND ad_group_name IS NOT NULL AND ad_group_name != ''
      )
      SELECT 
        ad_group_name as ad_name,
        SUM(CAST(spend AS FLOAT64)) as spend,
        CAST(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000 AS INT64) as impressions,
        SUM(CAST(clicks AS INT64)) as clicks,
        SUM(CAST(conversions AS FLOAT64)) as installs,
        SAFE_DIVIDE(SUM(CAST(clicks AS FLOAT64)), NULLIF(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000, 0)) as ctr,
        SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(conversions AS FLOAT64)), 0)) as cpi
      FROM deduped WHERE rn = 1
      GROUP BY ad_group_name
      ORDER BY spend DESC
      LIMIT 50
    `;

    const totalsQuery = `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE date BETWEEN '${startDate}' AND '${endDate}'
        ${campaignFilter}
      )
      SELECT 
        SUM(CAST(spend AS FLOAT64)) as total_spend,
        CAST(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000 AS INT64) as total_impressions,
        SUM(CAST(clicks AS INT64)) as total_clicks,
        SUM(CAST(conversions AS FLOAT64)) as total_installs,
        SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(conversions AS FLOAT64)), 0)) as cpi,
        SAFE_DIVIDE(SUM(CAST(clicks AS FLOAT64)), NULLIF(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000, 0)) as ctr
      FROM deduped WHERE rn = 1
    `;

    const prevTotalsQuery = `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE date BETWEEN '${prevStartStr}' AND '${prevEndStr}'
        ${campaignFilter}
      )
      SELECT 
        SUM(CAST(spend AS FLOAT64)) as total_spend,
        CAST(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000 AS INT64) as total_impressions,
        SUM(CAST(clicks AS INT64)) as total_clicks,
        SUM(CAST(conversions AS FLOAT64)) as total_installs,
        SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(conversions AS FLOAT64)), 0)) as cpi,
        SAFE_DIVIDE(SUM(CAST(clicks AS FLOAT64)), NULLIF(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000, 0)) as ctr
      FROM deduped WHERE rn = 1
    `;

    // Execute main queries in parallel
    const [bqDailyData, bqCampaignData, bqTotalsData, prevTotalsData] = await Promise.all([
      queryBigQuery(dailyQuery, accessToken),
      queryBigQuery(campaignQuery, accessToken),
      queryBigQuery(totalsQuery, accessToken),
      queryBigQuery(prevTotalsQuery, accessToken),
    ]);

    // Fetch ad-level data separately (fault-tolerant)
    let bqAdsData: any[] = [];
    try {
      bqAdsData = await queryBigQuery(adsQuery, accessToken);
    } catch (adsError) {
      console.log("Ad-level query failed:", adsError);
      bqAdsData = [];
    }

    // Process BigQuery data
    const dailyData = bqDailyData.map((row: any) => ({
      date: row.date,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      installs: parseFloat(row.installs) || 0,
    }));

    const campaignData = bqCampaignData.map((row: any) => ({
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
      installs: parseFloat(row.installs) || 0,
      cpi: parseFloat(row.installs) > 0 ? parseFloat(row.spend) / parseFloat(row.installs) : 0,
    })).sort((a: any, b: any) => b.spend - a.spend);

    const adsData = bqAdsData.map((row: any) => ({
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

    const prevTotals = prevTotalsData[0] || {};
    const previousTotalsResult = {
      spend: parseFloat(prevTotals.total_spend) || 0,
      impressions: parseInt(prevTotals.total_impressions) || 0,
      clicks: parseInt(prevTotals.total_clicks) || 0,
      installs: parseFloat(prevTotals.total_installs) || 0,
      cpi: parseFloat(prevTotals.cpi) || 0,
      ctr: parseFloat(prevTotals.ctr) || 0,
    };

    // Apply manual overrides for dates missing from BigQuery
    for (const [overrideDate, override] of Object.entries(MANUAL_OVERRIDES)) {
      // Apply to current period
      if (overrideDate >= startDate && overrideDate <= endDate) {
        const existingDay = dailyData.find((d: any) => d.date === overrideDate);
        if (!existingDay || existingDay.spend === 0) {
          const idx = dailyData.findIndex((d: any) => d.date === overrideDate);
          if (idx >= 0) dailyData.splice(idx, 1);
          dailyData.push({ date: overrideDate, spend: override.spend, impressions: 0, clicks: 0, installs: override.installs });
          dailyData.sort((a: any, b: any) => a.date.localeCompare(b.date));
          totals.spend += override.spend;
          totals.installs += override.installs;
          totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;
        }
      }
      // Apply to previous period
      if (overrideDate >= prevStartStr && overrideDate <= prevEndStr) {
        // Check if BQ already had data for this date (non-zero spend in prevTotals is ambiguous for single overrides, so always augment if override date falls in range)
        previousTotalsResult.spend += override.spend;
        previousTotalsResult.installs += override.installs;
        previousTotalsResult.cpi = previousTotalsResult.installs > 0 ? previousTotalsResult.spend / previousTotalsResult.installs : 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData,
          campaigns: campaignData,
          ads: adsData,
          totals,
          previousTotals: previousTotalsResult,
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
