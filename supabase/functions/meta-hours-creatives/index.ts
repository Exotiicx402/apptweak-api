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

  // Step 1: Batch-query ad_ids to get creative{image_hash}
  const adIds = [...new Set(ads.map((a) => a.ad_id))];
  const adIdToHash = new Map<string, string>();
  const BATCH_SIZE = 50;

  console.log(`Resolving image hashes for ${adIds.length} unique ad IDs...`);

  for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
    const batch = adIds.slice(i, i + BATCH_SIZE);
    const idsParam = batch.join(",");
    const url = `https://graph.facebook.com/v19.0/?ids=${idsParam}&fields=id,creative{image_hash}&access_token=${accessToken}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Creative hash batch error: ${await resp.text()}`);
        continue;
      }
      const data = await resp.json();
      for (const [adId, adData] of Object.entries(data as Record<string, any>)) {
        const hash = adData?.creative?.image_hash;
        if (hash) {
          adIdToHash.set(adId, hash);
        }
      }
    } catch (err) {
      console.error(`Creative hash batch failed:`, err);
    }
  }

  console.log(`Found ${adIdToHash.size} image hashes out of ${adIds.length} ads`);

  // Step 2: Resolve unique hashes to full-res URLs via Ad Images API
  const uniqueHashes = [...new Set(adIdToHash.values())];
  const hashToUrl = new Map<string, string>();

  for (let i = 0; i < uniqueHashes.length; i += BATCH_SIZE) {
    const batch = uniqueHashes.slice(i, i + BATCH_SIZE);
    const hashesParam = JSON.stringify(batch);
    const url = `https://graph.facebook.com/v19.0/${adAccountId}/adimages?hashes=${encodeURIComponent(hashesParam)}&fields=hash,url&access_token=${accessToken}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Ad images batch error: ${await resp.text()}`);
        continue;
      }
      const data = await resp.json();
      for (const img of data.data || []) {
        if (img.hash && img.url) {
          hashToUrl.set(img.hash, img.url);
        }
      }
    } catch (err) {
      console.error(`Ad images batch failed:`, err);
    }
  }

  console.log(`Resolved ${hashToUrl.size} full-res URLs from ${uniqueHashes.length} hashes`);

  // Step 3: Map URLs back to ads
  for (const ad of ads) {
    const hash = adIdToHash.get(ad.ad_id);
    if (hash) {
      ad.image_url = hashToUrl.get(hash) || null;
    }
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
