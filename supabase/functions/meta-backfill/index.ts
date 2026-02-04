import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
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
    throw new Error(`Failed to get Google access token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

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
    "ad_id",
    "ad_name",
    "impressions",
    "clicks",
    "spend",
    "reach",
    "cpm",
    "cpc",
    "ctr",
    "actions",
  ].join(",");

  const timeRange = JSON.stringify({ since: date, until: date });

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "ad");
  url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "500");

  console.log(`[${date}] Fetching Meta ad-level insights...`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${date}] Meta API error:`, errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  console.log(`[${date}] Fetched ${data.data?.length ?? 0} ads`);

  return data.data || [];
}

function filterAppInstallCampaigns(campaigns: any[]): any[] {
  return campaigns.filter(
    (c) => c.campaign_name?.toUpperCase().includes("APP INSTALLS")
  );
}

function formatTimestamp(dateStr: string): string {
  return `${dateStr} 00:00:00`;
}

function transformData(metaData: any[], targetDate: string, fetchedAt: string): any[] {
  return metaData.map((row) => ({
    timestamp: formatTimestamp(targetDate),
    campaign_id: row.campaign_id || "",
    campaign_name: row.campaign_name || "",
    ad_id: row.ad_id || "",
    ad_name: row.ad_name || "",
    impressions: parseInt(row.impressions || "0", 10),
    clicks: parseInt(row.clicks || "0", 10),
    spend: parseFloat(row.spend || "0"),
    reach: parseInt(row.reach || "0", 10),
    cpm: parseFloat(row.cpm || "0"),
    cpc: parseFloat(row.cpc || "0"),
    ctr: parseFloat(row.ctr || "0"),
    actions: row.actions ? JSON.stringify(row.actions) : null,
    fetched_at: fetchedAt,
  }));
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

async function deleteExistingDataForDate(date: string, accessToken: string): Promise<void> {
  const { projectId, datasetId, tableId } = resolveBigQueryTarget();
  const fullTableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  const deleteQuery = `
    DELETE FROM ${fullTableRef}
    WHERE DATE(timestamp) = '${date}'
  `;

  console.log(`Deleting existing data for ${date} from ${fullTableRef}`);

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: deleteQuery,
        useLegacySql: false,
        timeoutMs: 30000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Delete warning for ${date}:`, errorText);
    // Don't throw - continue with insert even if delete fails
  } else {
    const result = await response.json();
    const deleted = parseInt(result.numDmlAffectedRows || "0", 10);
    console.log(`Deleted ${deleted} existing rows for ${date}`);
  }
}

async function insertIntoBigQuery(rows: any[], accessToken: string): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const { projectId, datasetId, tableId } = resolveBigQueryTarget();
  const fullTableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  console.log(`Inserting ${rows.length} rows into ${fullTableRef}`);

  const valueRows = rows
    .map(
      (r) =>
        `(TIMESTAMP '${r.timestamp}', '${r.campaign_id}', '${r.campaign_name.replace(/'/g, "\\'")}', '${r.ad_id}', '${r.ad_name.replace(/'/g, "\\'")}', ${r.impressions}, ${r.clicks}, ${r.spend}, ${r.reach}, ${r.cpm}, ${r.cpc}, ${r.ctr}, ${r.actions ? `'${r.actions.replace(/'/g, "\\'")}'` : "NULL"}, TIMESTAMP '${r.fetched_at}')`
    )
    .join(",\n");

  const insertQuery = `
    INSERT INTO ${fullTableRef} (timestamp, campaign_id, campaign_name, ad_id, ad_name, impressions, clicks, spend, reach, cpm, cpc, ctr, actions, fetched_at)
    VALUES ${valueRows}
  `;

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: insertQuery,
        useLegacySql: false,
        timeoutMs: 30000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("BigQuery error:", errorText);
    throw new Error(`BigQuery error: ${errorText}`);
  }

  const result = await response.json();
  return parseInt(result.numDmlAffectedRows || rows.length.toString(), 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: startDate and endDate (YYYY-MM-DD)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid date format. Use YYYY-MM-DD",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (startDate > endDate) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "startDate must be before or equal to endDate",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dates = getDateRange(startDate, endDate);
    console.log(`Starting Meta backfill for ${dates.length} dates: ${startDate} to ${endDate}`);

    const googleAccessToken = await getGoogleAccessToken();
    const fetchedAt = new Date().toISOString().replace("T", " ").replace("Z", "");

    const results: { date: string; ads: number; rowsAffected: number }[] = [];
    let totalRowsAffected = 0;

    for (const date of dates) {
      try {
        const rawData = await fetchMetaInsights(date);
        const filteredData = filterAppInstallCampaigns(rawData);
        
        console.log(`[${date}] Filtered to ${filteredData.length} APP INSTALLS ads from ${rawData.length} total`);

        if (filteredData.length > 0) {
          const transformedData = transformData(filteredData, date, fetchedAt);
          // Delete existing data for this date, then insert fresh ad-level data
          await deleteExistingDataForDate(date, googleAccessToken);
          const rowsAffected = await insertIntoBigQuery(transformedData, googleAccessToken);
          
          results.push({ date, ads: filteredData.length, rowsAffected });
          totalRowsAffected += rowsAffected;
        } else {
          results.push({ date, ads: 0, rowsAffected: 0 });
        }

        // Rate limiting pause between dates
        await sleep(300);
      } catch (err) {
        console.error(`[${date}] Error:`, err);
        results.push({ date, ads: 0, rowsAffected: 0 });
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`Meta backfill completed in ${durationMs}ms. Total rows affected: ${totalRowsAffected}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          datesSynced: dates.length,
          totalRowsAffected,
          durationMs,
          results,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("Backfill error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
