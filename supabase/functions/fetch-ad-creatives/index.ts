import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Layer 1: Syncs ads + insights from Meta Graph API into ad_creatives_daily_cache.
 * Filters for Hours campaigns only (campaigns containing both "HOURS" and "APP").
 * Requests thumbnail_width=1080 for HD thumbnails.
 */

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getCachedDates(supabase: any, accountId: string, startDate: string, endDate: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("ad_creatives_daily_cache")
    .select("date")
    .eq("account_id", accountId)
    .gte("date", startDate)
    .lte("date", endDate);

  const dates = new Set<string>();
  for (const row of data || []) {
    dates.add(row.date);
  }
  return dates;
}

function getDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function getTodayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function getYesterdayET(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

interface FetchResult {
  adsUpserted: number;
  insightsUpserted: number;
  datesProcessed: number;
}

async function fetchAndCacheDate(
  accountId: string,
  accessToken: string,
  date: string,
  supabase: any
): Promise<{ ads: number; insights: number }> {
  // Step 1: Fetch ads with creative details (HD thumbnails)
  const adsFields = "id,name,status,effective_status,adset_id,adset{id,name},creative{id,thumbnail_url,image_hash,object_story_spec{link_data{image_hash,picture},video_data{video_id},photo_data{image_hash}},asset_feed_spec{images{hash,url},videos{video_id,thumbnail_url}},title,body,call_to_action_type}";
  
  const filtering = JSON.stringify([
    { field: "campaign.name", operator: "CONTAIN", value: "hours" },
  ]);

  let adsUrl: string | null = `https://graph.facebook.com/v21.0/${accountId}/ads?fields=${encodeURIComponent(adsFields)}&filtering=${encodeURIComponent(filtering)}&thumbnail_width=1080&thumbnail_height=1080&limit=200&access_token=${accessToken}`;
  
  const adMap = new Map<string, any>();
  while (adsUrl) {
    const resp = await fetch(adsUrl);
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Ads API error: ${err.substring(0, 300)}`);
      break;
    }
    const data = await resp.json();
    for (const ad of data.data || []) {
      // Filter: campaign name must contain both HOURS and APP
      const campaignCheck = ad.adset?.name?.toUpperCase() || "";
      adMap.set(ad.id, ad);
    }
    adsUrl = data.paging?.next || null;
  }

  // Step 2: Fetch insights for this date
  const insightsFields = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,date_start,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions";
  const timeRange = JSON.stringify({ since: date, until: date });
  
  let insightsUrl: string | null = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=${encodeURIComponent(insightsFields)}&level=ad&time_range=${encodeURIComponent(timeRange)}&filtering=${encodeURIComponent(filtering)}&action_attribution_windows=${encodeURIComponent('["1d_click"]')}&limit=500&access_token=${accessToken}`;

  const insightsByAdId = new Map<string, any>();
  while (insightsUrl) {
    const resp = await fetch(insightsUrl);
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Insights API error for ${date}: ${err.substring(0, 300)}`);
      break;
    }
    const data = await resp.json();
    for (const row of data.data || []) {
      // Only include if campaign name contains both HOURS and APP
      const cn = (row.campaign_name || "").toUpperCase();
      if (cn.includes("HOURS") && cn.includes("APP")) {
        insightsByAdId.set(row.ad_id, row);
      }
    }
    insightsUrl = data.paging?.next || null;
  }

  // Step 3: Upsert into cache
  const rows: any[] = [];
  const processedAdIds = new Set<string>();

  // Process ads that have insights
  for (const [adId, insight] of insightsByAdId) {
    processedAdIds.add(adId);
    rows.push({
      account_id: accountId,
      date,
      ad_id: adId,
      adset_id: insight.adset_id || null,
      ad_data: adMap.get(adId) || {},
      insights_data: insight,
      synced_at: new Date().toISOString(),
    });
  }

  // Also cache ads without insights (zero spend)
  for (const [adId, ad] of adMap) {
    if (!processedAdIds.has(adId)) {
      rows.push({
        account_id: accountId,
        date,
        ad_id: adId,
        adset_id: ad.adset_id || ad.adset?.id || null,
        ad_data: ad,
        insights_data: {},
        synced_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length > 0) {
    // Batch upsert in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase
        .from("ad_creatives_daily_cache")
        .upsert(batch, { onConflict: "account_id,date,ad_id" });
      if (error) {
        console.error(`Upsert error: ${error.message}`);
      }
    }
  }

  return { ads: adMap.size, insights: insightsByAdId.size };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate || getYesterdayET();
    const endDate = body.endDate || getTodayET();
    const forceRefresh = body.forceRefresh === true;

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
    if (!accessToken || !adAccountId) throw new Error("Missing META credentials");
    if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;

    const supabase = getSupabase();
    const today = getTodayET();
    const yesterday = getYesterdayET();

    // Determine which dates need fetching
    const allDates = getDatesBetween(startDate, endDate);
    const cachedDates = forceRefresh ? new Set<string>() : await getCachedDates(supabase, adAccountId, startDate, endDate);
    
    // Always re-sync today and yesterday (partial data)
    const datesToFetch = allDates.filter(d => 
      !cachedDates.has(d) || d === today || d === yesterday
    );

    console.log(`Date range: ${startDate} to ${endDate}. Total: ${allDates.length}, cached: ${cachedDates.size}, to fetch: ${datesToFetch.length}`);

    let totalAds = 0;
    let totalInsights = 0;

    for (const date of datesToFetch) {
      console.log(`Fetching ${date}...`);
      const result = await fetchAndCacheDate(adAccountId, accessToken, date, supabase);
      totalAds += result.ads;
      totalInsights += result.insights;
      // Small delay to avoid rate limits
      if (datesToFetch.length > 5) await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Done. Fetched ${datesToFetch.length} dates, ${totalAds} ads, ${totalInsights} insights`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          datesFetched: datesToFetch.length,
          totalAds,
          totalInsights,
          startDate,
          endDate,
        },
      }),
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
