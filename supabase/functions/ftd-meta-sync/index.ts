import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Campaign name fragment to identify the FTD campaign
const FTD_CAMPAIGN_FRAGMENT = "FTD";

// Primary: Meta standard "Add Payment Info" event
const FTD_ACTION_TYPE = "add_payment_info";
// Fallback: pixel custom variant
const FTD_ACTION_TYPE_ALT = "offsite_conversion.fb_pixel_custom.AddPaymentInfo";
// Legacy fallbacks for historical data
const FTD_ACTION_TYPE_LEGACY = "offsite_conversion.custom.FirstTimeDeposit";
const FTD_ACTION_TYPE_LEGACY_ALT = "offsite_conversion.fb_pixel_custom.FirstTimeDeposit";

function extractFTDCount(actions: any[]): number {
  if (!actions || !Array.isArray(actions)) return 0;

  // Try Add Payment Info first, then legacy FirstTimeDeposit
  const specific = actions.find(
    (a: any) =>
      a.action_type === FTD_ACTION_TYPE ||
      a.action_type === FTD_ACTION_TYPE_ALT ||
      a.action_type === FTD_ACTION_TYPE_LEGACY ||
      a.action_type === FTD_ACTION_TYPE_LEGACY_ALT ||
      (typeof a.action_type === "string" && (a.action_type.toLowerCase().includes("addpaymentinfo") || a.action_type.toLowerCase().includes("firsttimedeposit")))
  );
  if (specific) return parseInt(specific.value) || 0;

  return 0;
}

function extractFTDValue(actionValues: any[]): number {
  if (!actionValues || !Array.isArray(actionValues)) return 0;

  const specific = actionValues.find(
    (a: any) =>
      a.action_type === FTD_ACTION_TYPE ||
      a.action_type === FTD_ACTION_TYPE_ALT ||
      (typeof a.action_type === "string" && a.action_type.toLowerCase().includes("firsttimedeposit"))
  );
  if (specific) return parseFloat(specific.value) || 0;

  return 0;
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

  // Validate dates
  if (startDate > endDate) {
    throw new Error(`Invalid date range: startDate (${startDate}) must be <= endDate (${endDate})`);
  }

  const fields = [
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "clicks",
    "cpm",
    "cpc",
    "ctr",
    "actions",
    "action_values",
    "conversions",
    "conversion_values",
  ].join(",");

  // Build params manually to avoid encoding issues with time_range JSON
  const params = new URLSearchParams();
  params.set("fields", fields);
  params.set("time_range", `{"since":"${startDate}","until":"${endDate}"}`);
  params.set("level", "campaign");
  params.set("time_increment", "1");
  params.set("action_attribution_windows", '["1d_click"]');
  // Removed action_breakdowns - not needed at campaign level
  params.set("access_token", accessToken);
  params.set("limit", "500");

  const baseUrl = `https://graph.facebook.com/v22.0/${adAccountId}/insights`;
  console.log(`Fetching Meta FTD ad-level data: ${startDate} to ${endDate}`);

  const response = await fetch(`${baseUrl}?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meta API error:", errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  let allRows: any[] = data.data || [];

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

  console.log(`Total rows before FTD filter: ${allRows.length} across ${pageCount} pages`);
  if (allRows.length > 0) {
    console.log(`Sample campaign names: ${[...new Set(allRows.slice(0, 5).map((r: any) => r.campaign_name))].join(" | ")}`);
  }

  // Filter client-side to only FTD campaign rows (case-insensitive, matches "FTD" anywhere in name)
  const ftdRows = allRows.filter((row: any) =>
    typeof row.campaign_name === "string" &&
    row.campaign_name.toUpperCase().includes(FTD_CAMPAIGN_FRAGMENT.toUpperCase())
  );

  console.log(`FTD rows after filtering: ${ftdRows.length}`);
  return ftdRows;
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

    // Log FTD extraction for verification
    rawRows.forEach((row: any) => {
      const ftdConv = (row.conversions || []).find((a: any) => 
        typeof a.action_type === "string" && a.action_type.toLowerCase().includes("firsttimedeposit")
      );
      console.log(`Campaign: ${row.campaign_name} | Date: ${row.date_start} | FTD conversions: ${JSON.stringify(ftdConv || 'none')}`);
    });

    // Transform rows (campaign-level)
    const rows = rawRows.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      // Use conversions field which provides granular custom event breakdown
      const ftdCount = extractFTDCount(row.conversions || row.actions);
      const resultsValue = extractFTDValue(row.conversion_values || row.action_values);
      const roas = spend > 0 ? resultsValue / spend : 0;
      return {
        date: row.date_start,
        campaign_id: row.campaign_id || null,
        campaign_name: row.campaign_name || null,
        adset_id: null,
        adset_name: null,
        ad_id: null,
        ad_name: null,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        ftd_count: ftdCount,
        cost_per_ftd: ftdCount > 0 ? spend / ftdCount : 0,
        results_value: resultsValue,
        roas,
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
    // Use delete+insert pattern to avoid conflict issues with nullable ad_id
    const dates = [...new Set(rows.map((r: any) => r.date))];
    console.log(`Deleting existing rows for dates: ${dates.join(", ")}`);
    const { error: deleteError } = await supabase
      .from("ftd_performance")
      .delete()
      .in("date", dates);

    if (deleteError) {
      console.error("Delete error:", deleteError);
      throw deleteError;
    }

    const { error } = await supabase
      .from("ftd_performance")
      .insert(rows);

    if (error) {
      console.error("Supabase insert error:", error);
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
