import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

async function logSync(
  syncDate: string,
  status: "success" | "error",
  rowsAffected: number | null,
  durationMs: number,
  errorMessage?: string
) {
  const supabase = getSupabaseClient();
  await supabase.from("sync_logs").insert({
    sync_date: syncDate,
    status,
    rows_affected: rowsAffected,
    duration_ms: durationMs,
    source: "meta",
    error_message: errorMessage ?? null,
  });
}

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
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

async function fetchMetaInsights(date: string): Promise<any[]> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!accessToken || !adAccountId) {
    throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID");
  }

  // Ensure ad account ID has the required "act_" prefix
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
    "action_values",
  ].join(",");

  const timeRange = JSON.stringify({
    since: date,
    until: date,
  });

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "ad");
  url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
  url.searchParams.set("access_token", accessToken);

  console.log(`Fetching Meta insights at ad level for date: ${date}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meta API error:", errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  console.log(`Fetched ${data.data?.length ?? 0} ads from Meta`);

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

function transformData(metaData: any[], targetDate: string): any[] {
  const fetchedAt = new Date().toISOString().replace("T", " ").replace("Z", "");

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
    action_values: row.action_values ? JSON.stringify(row.action_values) : null,
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

async function mergeIntoBigQuery(rows: any[], accessToken: string): Promise<number> {
  if (rows.length === 0) {
    console.log("No rows to merge into BigQuery");
    return 0;
  }

  const { projectId, datasetId, tableId } = resolveBigQueryTarget();
  const fullTableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  console.log(`Merging ${rows.length} rows into ${fullTableRef}`);

  const valueRows = rows
    .map(
      (r) =>
        `(TIMESTAMP '${r.timestamp}', '${r.campaign_id}', '${r.campaign_name.replace(/'/g, "\\'")}', '${r.ad_id}', '${r.ad_name.replace(/'/g, "\\'")}', ${r.impressions}, ${r.clicks}, ${r.spend}, ${r.reach}, ${r.cpm}, ${r.cpc}, ${r.ctr}, ${r.actions ? `'${r.actions.replace(/'/g, "\\'")}'` : "NULL"}, ${r.action_values ? `'${r.action_values.replace(/'/g, "\\'")}'` : "NULL"}, TIMESTAMP '${r.fetched_at}')`
    )
    .join(",\n");

  const mergeQuery = `
    MERGE ${fullTableRef} AS target
    USING (
      SELECT * FROM UNNEST([
        STRUCT<timestamp TIMESTAMP, campaign_id STRING, campaign_name STRING, ad_id STRING, ad_name STRING, impressions INT64, clicks INT64, spend FLOAT64, reach INT64, cpm FLOAT64, cpc FLOAT64, ctr FLOAT64, actions STRING, action_values STRING, fetched_at TIMESTAMP>
        ${valueRows}
      ])
    ) AS source
    ON target.timestamp = source.timestamp AND target.ad_id = source.ad_id
    WHEN MATCHED THEN UPDATE SET
      campaign_id = source.campaign_id,
      campaign_name = source.campaign_name,
      ad_name = source.ad_name,
      impressions = source.impressions,
      clicks = source.clicks,
      spend = source.spend,
      reach = source.reach,
      cpm = source.cpm,
      cpc = source.cpc,
      ctr = source.ctr,
      actions = source.actions,
      action_values = source.action_values,
      fetched_at = source.fetched_at
    WHEN NOT MATCHED THEN INSERT (timestamp, campaign_id, campaign_name, ad_id, ad_name, impressions, clicks, spend, reach, cpm, cpc, ctr, actions, action_values, fetched_at)
    VALUES (source.timestamp, source.campaign_id, source.campaign_name, source.ad_id, source.ad_name, source.impressions, source.clicks, source.spend, source.reach, source.cpm, source.cpc, source.ctr, source.actions, source.action_values, source.fetched_at)
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
        query: mergeQuery,
        useLegacySql: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("BigQuery error:", errorText);
    throw new Error(`BigQuery error: ${errorText}`);
  }

  const result = await response.json();
  const rowsAffected = parseInt(result.numDmlAffectedRows || "0", 10);
  console.log(`BigQuery merge complete. Rows affected: ${rowsAffected}`);

  return rowsAffected;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let targetDate = getYesterdayDate();

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.date) {
        targetDate = body.date;
      }
    }

    console.log(`Starting Meta sync for date: ${targetDate}`);

    // Fetch Meta insights
    const rawMetaData = await fetchMetaInsights(targetDate);
    const metaData = filterAppInstallCampaigns(rawMetaData);
    console.log(`Filtered to ${metaData.length} APP INSTALLS campaigns from ${rawMetaData.length} total`);

    if (metaData.length === 0) {
      console.log("No APP INSTALLS campaigns for this date");
      await logSync(targetDate, "success", 0, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: true, message: "No APP INSTALLS campaigns for this date", rowsAffected: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform data
    const transformedRows = transformData(metaData, targetDate);

    // Get Google access token for BigQuery
    const googleAccessToken = await getAccessToken();

    // Merge into BigQuery
    const rowsAffected = await mergeIntoBigQuery(transformedRows, googleAccessToken);

    const durationMs = Date.now() - startTime;
    await logSync(targetDate, "success", rowsAffected, durationMs);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${rowsAffected} rows for ${targetDate}`,
        rowsAffected,
        durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", errorMessage);

    await logSync(targetDate, "error", null, durationMs, errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
