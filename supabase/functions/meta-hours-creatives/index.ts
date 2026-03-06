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

// Get creative IDs and effective_object_story_ids for each ad
async function getCreativeDetails(
  adIds: string[],
  accessToken: string
): Promise<Map<string, { creativeId: string; storyId: string | null; imageUrl: string | null }>> {
  const result = new Map<string, { creativeId: string; storyId: string | null; imageUrl: string | null }>();

  for (let i = 0; i < adIds.length; i += 50) {
    const batch = adIds.slice(i, i + 50);
    const url = `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=id,creative{id,effective_object_story_id,image_url,thumbnail_url}&access_token=${accessToken}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`Creative details batch failed: ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const [adId, adData] of Object.entries(data)) {
        const creative = (adData as any)?.creative;
        if (!creative?.id) continue;
        result.set(adId, {
          creativeId: creative.id,
          storyId: creative.effective_object_story_id || null,
          imageUrl: creative.image_url || creative.thumbnail_url || null,
        });
      }
    } catch (err) {
      console.warn(`Creative details error: ${err}`);
    }
  }

  console.log(`Got creative details for ${result.size} of ${adIds.length} ads`);
  return result;
}

// Fetch full_picture from page posts using effective_object_story_id
async function getPostImages(
  storyIds: string[],
  accessToken: string
): Promise<Map<string, string>> {
  const storyToImage = new Map<string, string>();
  const unique = [...new Set(storyIds.filter(Boolean))];

  if (unique.length === 0) return storyToImage;

  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const url = `https://graph.facebook.com/v19.0/?ids=${batch.join(",")}&fields=id,full_picture&access_token=${accessToken}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`Post images batch ${Math.floor(i / 50) + 1} failed: ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const [postId, postData] of Object.entries(data)) {
        const pic = (postData as any)?.full_picture;
        if (pic) storyToImage.set(postId, pic);
      }
    } catch (err) {
      console.warn(`Post images error: ${err}`);
    }
  }

  console.log(`Got full_picture for ${storyToImage.size} of ${unique.length} posts`);
  return storyToImage;
}

// Transform Meta CDN URLs from 64x64 to higher resolution
// Meta CDN uses `stp=...p64x64...` param to control image size
function upscaleMetaCdnUrl(url: string): string {
  // Replace p64x64 with p720x720 for much better quality
  return url.replace(/p64x64/g, 'p720x720');
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

  // Resolve images via two approaches
  const adIds = allAds.map((a) => a.ad_id).filter(Boolean);
  
  // Step 1: Get creative IDs + effective_object_story_id + image_url
  const creativeDetails = await getCreativeDetails(adIds, accessToken);
  
  // Step 2: For creatives with effective_object_story_id, fetch the post's full_picture
  const storyIds = [...creativeDetails.values()]
    .map(c => c.storyId)
    .filter((s): s is string => !!s);
  
  const postImages = await getPostImages(storyIds, accessToken);

  // Map images back to ads — upscale 64x64 Meta CDN thumbnails to higher res
  let resolved = 0;
  for (const ad of allAds) {
    const details = creativeDetails.get(ad.ad_id);
    if (!details) continue;

    // Priority: full_picture from post > creative image_url (upscaled)
    if (details.storyId && postImages.has(details.storyId)) {
      ad.image_url = postImages.get(details.storyId)!;
      resolved++;
    } else if (details.imageUrl) {
      ad.image_url = upscaleMetaCdnUrl(details.imageUrl);
      resolved++;
    }
  }

  console.log(`Resolved images for ${resolved} of ${allAds.length} ads`);
  return allAds;
}

function extractInstalls(actions: any[] | undefined): number {
  if (!actions) return 0;
  const a = actions.find((a: any) => a.action_type === "mobile_app_install");
  return a ? parseInt(a.value) || 0 : 0;
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
    ads.sort((a, b) => b.spend - a.spend);

    const withImages = ads.filter(a => a.image_url).length;
    console.log(`Returning ${ads.length} ads (${withImages} with images)`);

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
