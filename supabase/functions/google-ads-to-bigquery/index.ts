import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
    source: "google_ads",
    status,
    rows_affected: rowsAffected,
    duration_ms: durationMs,
    error_message: errorMessage,
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

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google OAuth credentials");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchGoogleAdsData(date: string, accessToken: string): Promise<any[]> {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID")?.replace(/-/g, "");

  if (!developerToken || !customerId) {
    throw new Error("Missing Google Ads credentials (GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID)");
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

  const response = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
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
    
    if (errorText.includes("USER_PERMISSION_DENIED") || errorText.includes("OAUTH_TOKEN_INVALID")) {
      throw new Error(
        `Google Ads API access denied. Your GOOGLE_REFRESH_TOKEN may need to be regenerated with the Google Ads API scope. Error: ${errorText}`
      );
    }
    
    throw new Error(`Google Ads API error: ${errorText}`);
  }

  const data = await response.json();
  const results: any[] = [];

  if (Array.isArray(data)) {
    for (const batch of data) {
      if (batch.results) {
        for (const result of batch.results) {
          const campaign = result.campaign || {};
          const metrics = result.metrics || {};
          const segments = result.segments || {};

          const costMicros = Number(metrics.costMicros || 0);
          const spend = costMicros / 1_000_000;
          const installs = Number(metrics.conversions || 0);
          const impressions = Number(metrics.impressions || 0);
          const clicks = Number(metrics.clicks || 0);

          results.push({
            timestamp: `${segments.date || date} 00:00:00`,
            campaign_id: campaign.id?.toString() || "",
            campaign_name: campaign.name || "",
            impressions,
            clicks,
            cost_micros: costMicros,
            spend,
            installs: Math.round(installs),
            cpi: installs > 0 ? spend / installs : 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            fetched_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  return results;
}

function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  const tableId = Deno.env.get("GOOGLE_ADS_BQ_TABLE_ID");
  if (!tableId) {
    throw new Error("Missing GOOGLE_ADS_BQ_TABLE_ID environment variable");
  }

  const parts = tableId.split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid GOOGLE_ADS_BQ_TABLE_ID format: ${tableId}. Expected: project.dataset.table`);
  }

  return {
    projectId: parts[0],
    datasetId: parts[1],
    tableId: parts[2],
  };
}

async function mergeIntoBigQuery(rows: any[], accessToken: string): Promise<number> {
  if (rows.length === 0) return 0;

  const { projectId, datasetId, tableId } = resolveBigQueryTarget();
  const fullTableId = `${projectId}.${datasetId}.${tableId}`;

  // Build VALUES clause
  const valuesClause = rows
    .map((row) => {
      return `(
        TIMESTAMP('${row.timestamp}'),
        '${row.campaign_id}',
        '${row.campaign_name.replace(/'/g, "\\'")}',
        ${row.impressions},
        ${row.clicks},
        ${row.cost_micros},
        ${row.spend},
        ${row.installs},
        ${row.cpi},
        ${row.ctr},
        TIMESTAMP('${row.fetched_at}')
      )`;
    })
    .join(",\n");

  const mergeQuery = `
    MERGE \`${fullTableId}\` AS target
    USING (
      SELECT * FROM UNNEST([
        STRUCT<timestamp TIMESTAMP, campaign_id STRING, campaign_name STRING, impressions INT64, clicks INT64, cost_micros INT64, spend FLOAT64, installs INT64, cpi FLOAT64, ctr FLOAT64, fetched_at TIMESTAMP>
        ${valuesClause}
      ])
    ) AS source
    ON target.timestamp = source.timestamp AND target.campaign_id = source.campaign_id
    WHEN MATCHED THEN
      UPDATE SET
        campaign_name = source.campaign_name,
        impressions = source.impressions,
        clicks = source.clicks,
        cost_micros = source.cost_micros,
        spend = source.spend,
        installs = source.installs,
        cpi = source.cpi,
        ctr = source.ctr,
        fetched_at = source.fetched_at
    WHEN NOT MATCHED THEN
      INSERT (timestamp, campaign_id, campaign_name, impressions, clicks, cost_micros, spend, installs, cpi, ctr, fetched_at)
      VALUES (source.timestamp, source.campaign_id, source.campaign_name, source.impressions, source.clicks, source.cost_micros, source.spend, source.installs, source.cpi, source.ctr, source.fetched_at)
  `;

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
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
    throw new Error(`BigQuery error: ${errorText}`);
  }

  const result = await response.json();
  return result.numDmlAffectedRows ? Number(result.numDmlAffectedRows) : rows.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let targetDate = getYesterdayDate();

  try {
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.date) {
          targetDate = body.date;
        }
      } catch {
        // Use default date
      }
    }

    console.log(`Syncing Google Ads data for ${targetDate} to BigQuery`);

    const accessToken = await getAccessToken();
    const data = await fetchGoogleAdsData(targetDate, accessToken);

    console.log(`Fetched ${data.length} campaign records`);

    const rowsAffected = await mergeIntoBigQuery(data, accessToken);
    const durationMs = Date.now() - startTime;

    await logSync(targetDate, "success", rowsAffected, durationMs);

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        rowsAffected,
        durationMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await logSync(targetDate, "error", null, durationMs, errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
