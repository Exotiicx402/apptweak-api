import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get yesterday's date in EST timezone
function getYesterdayDate(): string {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  estNow.setDate(estNow.getDate() - 1);
  return estNow.toISOString().split("T")[0];
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
    "impressions",
    "clicks",
    "spend",
    "reach",
    "cpm",
    "cpc",
    "ctr",
    "actions",
  ].join(",");

  const timeRange = JSON.stringify({
    since: date,
    until: date,
  });

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
  url.searchParams.set("access_token", accessToken);

  console.log(`Fetching Meta preview for date: ${date}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meta API error:", errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  return data.data || [];
}

function filterMarchMadnessCampaigns(campaigns: any[]): any[] {
  return campaigns.filter(
    (c) => c.campaign_name?.toUpperCase().includes("MARCH MADNESS")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    let targetDate = getYesterdayDate();

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.date) {
        targetDate = body.date;
      }
    }

    console.log(`Fetching Meta preview for date: ${targetDate}`);

    const rawData = await fetchMetaInsights(targetDate);
    const data = filterMarchMadnessCampaigns(rawData);
    console.log(`Filtered to ${data.length} MARCH MADNESS campaigns from ${rawData.length} total`);
    const durationMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        count: data.length,
        data,
        durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Preview error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
