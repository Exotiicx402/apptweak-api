import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate || "2025-10-01";
    const endDate = body.endDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const campaignKeyword = body.campaignKeyword || "hours";

    console.log(`Querying ads from campaigns containing "${campaignKeyword}" between ${startDate} and ${endDate}`);

    const googleAccessToken = await getGoogleAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    const query = `
      SELECT 
        COALESCE(ad_id, '') as ad_id,
        ad_name,
        campaign_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SAFE_DIVIDE(SUM(clicks), SUM(impressions)) as ctr,
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
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
        AND UPPER(campaign_name) LIKE '%${campaignKeyword.toUpperCase()}%'
        AND ad_name IS NOT NULL AND ad_name != ''
      GROUP BY ad_id, ad_name, campaign_name
      ORDER BY spend DESC
    `;

    const rows = await queryBigQuery(query, googleAccessToken);

    const ads = rows.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      return {
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        campaign_name: row.campaign_name,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
      };
    });

    console.log(`Found ${ads.length} ads from "${campaignKeyword}" campaigns`);

    return new Response(
      JSON.stringify({ success: true, data: { ads } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
