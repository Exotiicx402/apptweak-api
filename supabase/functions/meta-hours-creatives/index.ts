import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MetaAd {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  installs: number;
  cpi: number;
  image_url: string | null;
}

function extractInstalls(actions: any[] | undefined): number {
  if (!actions) return 0;
  const a = actions.find((a: any) => a.action_type === "mobile_app_install");
  return a ? parseInt(a.value) || 0 : 0;
}

async function fetchAllAds(
  adAccountId: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<MetaAd[]> {
  const allAds: MetaAd[] = [];
  const fields = "ad_id,ad_name,campaign_name,spend,impressions,clicks,ctr,actions";
  const timeRange = JSON.stringify({ since: startDate, until: endDate });
  const filtering = JSON.stringify([
    { field: "campaign.name", operator: "CONTAIN", value: "hours" },
  ]);

  let url: string | null = `https://graph.facebook.com/v19.0/${adAccountId}/insights`;
  const params = new URLSearchParams({
    fields,
    time_range: timeRange,
    level: "ad",
    filtering,
    action_attribution_windows: '["7d_click","1d_view"]',
    access_token: accessToken,
    limit: "500",
  });

  let pageCount = 0;
  while (url) {
    pageCount++;
    const fetchUrl = pageCount === 1 ? `${url}?${params.toString()}` : url;
    console.log(`Fetching insights page ${pageCount}...`);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Meta API error: ${await response.text()}`);
    const data = await response.json();

    for (const row of data.data || []) {
      const adName = row.ad_name || "";
      const upper = adName.toUpperCase();
      if (!upper.includes("IMAGE") && !upper.includes("IMG")) continue;

      const spend = parseFloat(row.spend) || 0;
      const installs = extractInstalls(row.actions);
      allAds.push({
        ad_id: row.ad_id || "",
        ad_name: adName,
        campaign_name: row.campaign_name || "",
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
        image_url: null,
      });
    }
    url = data.paging?.next || null;
  }

  console.log(`Fetched ${pageCount} pages, ${allAds.length} IMAGE/IMG ads`);
  return allAds;
}

async function resolveHighResImages(
  ads: MetaAd[],
  adAccountId: string,
  accessToken: string
): Promise<void> {
  if (ads.length === 0) return;

  const adIds = [...new Set(ads.map((a) => a.ad_id))];
  const adIdToUrl = new Map<string, string>();
  const adIdToCreativeId = new Map<string, string>();
  const unresolvedHashes = new Map<string, string[]>();
  const BATCH = 10;

  console.log(`Step 1: Getting creative IDs for ${adIds.length} ads...`);

  // Step 1: Get creative IDs from ad IDs
  for (let i = 0; i < adIds.length; i += BATCH) {
    const batch = adIds.slice(i, i + BATCH);
    const url = `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=id,creative{id}&access_token=${accessToken}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) { console.error(`Creative ID batch error: ${await resp.text()}`); continue; }
      const data = await resp.json();
      for (const [adId, adData] of Object.entries(data as Record<string, any>)) {
        const cid = adData?.creative?.id;
        if (cid) adIdToCreativeId.set(adId, cid);
      }
    } catch (err) { console.error(`Creative ID batch failed:`, err); }
  }

  console.log(`Found ${adIdToCreativeId.size} creative IDs`);

  // Step 2: Query creative IDs directly for object_story_spec + image_hash
  const creativeIdToAdIds = new Map<string, string[]>();
  for (const [adId, cid] of adIdToCreativeId) {
    if (!creativeIdToAdIds.has(cid)) creativeIdToAdIds.set(cid, []);
    creativeIdToAdIds.get(cid)!.push(adId);
  }

  const creativeIds = [...creativeIdToAdIds.keys()];
  console.log(`Step 2: Querying ${creativeIds.length} unique creatives for image URLs...`);

  for (let i = 0; i < creativeIds.length; i += BATCH) {
    const batch = creativeIds.slice(i, i + BATCH);
    const fields = "id,image_hash,image_url,object_story_spec";
    const url = `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=${encodeURIComponent(fields)}&access_token=${accessToken}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) { console.error(`Creative detail batch ${Math.floor(i/BATCH)+1} error: ${await resp.text()}`); continue; }
      const data = await resp.json();

      for (const [cid, creative] of Object.entries(data as Record<string, any>)) {
        const adIdsForCreative = creativeIdToAdIds.get(cid) || [];
        const oss = creative?.object_story_spec;

        // Priority 1: link_data.picture
        const linkPic = oss?.link_data?.picture;
        if (linkPic) { for (const aid of adIdsForCreative) adIdToUrl.set(aid, linkPic); continue; }
        // Priority 2: photo_data.url  
        const photoPic = oss?.photo_data?.url;
        if (photoPic) { for (const aid of adIdsForCreative) adIdToUrl.set(aid, photoPic); continue; }
        // Priority 3: image_hash from any level
        const hash = creative?.image_hash || oss?.link_data?.image_hash || oss?.photo_data?.image_hash;
        if (hash) {
          if (!unresolvedHashes.has(hash)) unresolvedHashes.set(hash, []);
          for (const aid of adIdsForCreative) unresolvedHashes.get(hash)!.push(aid);
          continue;
        }
        // Priority 4: creative.image_url fallback
        if (creative?.image_url) { for (const aid of adIdsForCreative) adIdToUrl.set(aid, creative.image_url); }
      }
    } catch (err) { console.error(`Creative detail batch failed:`, err); }
  }

  console.log(`Direct URLs: ${adIdToUrl.size}, unresolved hashes: ${unresolvedHashes.size}`);

  // Step 3: Resolve remaining hashes via /adimages API
  if (unresolvedHashes.size > 0) {
    const uniqueHashes = [...unresolvedHashes.keys()];
    for (let i = 0; i < uniqueHashes.length; i += 50) {
      const batch = uniqueHashes.slice(i, i + 50);
      const url = `https://graph.facebook.com/v19.0/${adAccountId}/adimages?hashes=${encodeURIComponent(JSON.stringify(batch))}&fields=hash,url&access_token=${accessToken}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) { console.error(`Adimages error: ${await resp.text()}`); continue; }
        const data = await resp.json();
        for (const img of data.data || []) {
          if (img.hash && img.url) {
            for (const aid of (unresolvedHashes.get(img.hash) || [])) {
              if (!adIdToUrl.has(aid)) adIdToUrl.set(aid, img.url);
            }
          }
        }
      } catch (err) { console.error(`Adimages failed:`, err); }
    }
  }

  // Step 4: Map URLs back to ads
  for (const ad of ads) {
    ad.image_url = adIdToUrl.get(ad.ad_id) || null;
  }

  const withImages = ads.filter((a) => a.image_url).length;
  console.log(`${withImages}/${ads.length} ads now have high-res image URLs`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate || "2025-10-01";
    const endDate = body.endDate || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

    if (!accessToken || !adAccountId) throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID");
    if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;

    console.log(`Querying Meta API for Hours IMAGE ads between ${startDate} and ${endDate}`);

    const ads = await fetchAllAds(adAccountId, accessToken, startDate, endDate);

    // Resolve high-res image URLs
    await resolveHighResImages(ads, adAccountId, accessToken);

    ads.sort((a, b) => b.spend - a.spend);

    console.log(`Returning ${ads.length} ads`);

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
