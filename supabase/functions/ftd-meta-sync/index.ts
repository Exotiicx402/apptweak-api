import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Campaign name fragment to identify the FTD campaign
const FTD_CAMPAIGN_FRAGMENT = "FTD";

// The Meta custom conversion event name
const FTD_ACTION_TYPE = "offsite_conversion.custom.FirstTimeDeposit";
// Fallback: some setups use the pixel custom event name differently
const FTD_ACTION_TYPE_ALT = "offsite_conversion.fb_pixel_custom.FirstTimeDeposit";

function extractFTDCount(actions: any[]): number {
  if (!actions || !Array.isArray(actions)) return 0;
  const action = actions.find(
    (a: any) =>
      a.action_type === FTD_ACTION_TYPE ||
      a.action_type === FTD_ACTION_TYPE_ALT ||
      // Also check for any action_type containing "FirstTimeDeposit"
      (typeof a.action_type === "string" && a.action_type.includes("FirstTimeDeposit"))
  );
  return action ? parseInt(action.value) || 0 : 0;
}

async function fetchMetaFTDInsights(
  startDate: string,
  endDate: string
): Promise<any[]> {
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
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
    "actions",
  ].join(",");

  const timeRange = JSON.stringify({ since: startDate, until: endDate });

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1"); // daily breakdown
  url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
  url.searchParams.set("filtering", JSON.stringify([
    {
      field: "campaign.name",
      operator: "CONTAIN",
      value: FTD_CAMPAIGN_FRAGMENT,
    },
  ]));
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "500");

  console.log(`Fetching Meta FTD ad-level data: ${startDate} to ${endDate}`);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meta API error:", errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  let allRows = data.data || [];

  // Follow pagination cursors
  let nextUrl = data.paging?.next;
  let pageCount = 1;
  while (nextUrl && allRows.length < 5000) {
    console.log(`Fetching page ${++pageCount}...`);
    const nextResp = await fetch(nextUrl);
    if (!nextResp.ok) break;
    const nextData = await nextResp.json();
    allRows = allRows.concat(nextData.data || []);
    nextUrl = nextData.paging?.next;
  }

  console.log(`Total FTD rows fetched: ${allRows.length} across ${pageCount} pages`);
  return allRows;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawRows = await fetchMetaFTDInsights(startDate, endDate);

    if (rawRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No FTD campaign data returned from Meta API for this date range.",
          rowsUpserted: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform rows
    const rows = rawRows.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const ftdCount = extractFTDCount(row.actions);
      return {
        date: row.date_start,
        campaign_id: row.campaign_id || null,
        campaign_name: row.campaign_name || null,
        adset_id: row.adset_id || null,
        adset_name: row.adset_name || null,
        ad_id: row.ad_id || null,
        ad_name: row.ad_name || null,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        ftd_count: ftdCount,
        cost_per_ftd: ftdCount > 0 ? spend / ftdCount : 0,
        cpm: parseFloat(row.cpm) || 0,
        cpc: parseFloat(row.cpc) || 0,
        ctr: parseFloat(row.ctr) || 0,
        synced_at: new Date().toISOString(),
      };
    });

    // Log action types seen for debugging
    const actionTypes = new Set<string>();
    rawRows.forEach((r: any) => {
      if (r.actions) r.actions.forEach((a: any) => actionTypes.add(a.action_type));
    });
    console.log("Action types seen:", [...actionTypes].join(", "));

    // Upsert into ftd_performance table
    const { error, count } = await supabase
      .from("ftd_performance")
      .upsert(rows, {
        onConflict: "date,ad_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Supabase upsert error:", error);
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        rowsUpserted: rows.length,
        actionTypesFound: [...actionTypes],
        dateRange: `${startDate} to ${endDate}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
