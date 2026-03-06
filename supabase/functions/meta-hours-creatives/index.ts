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

// Fetch ad creative image URLs in batches using the /ads endpoint
async function fetchAdImageUrls(
  adIds: string[],
  accessToken: string
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  if (adIds.length === 0) return imageMap;

  // Batch in groups of 50 to avoid API limits
  for (let i = 0; i < adIds.length; i += 50) {
    const batch = adIds.slice(i, i + 50);
    const ids = batch.join(",");
    const url = `https://graph.facebook.com/v19.0/?ids=${ids}&fields=id,creative{image_url,thumbnail_url,object_story_spec}&access_token=${accessToken}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Batch creative fetch failed: ${response.status}`);
        continue;
      }
      const data = await response.json();

      for (const [adId, adData] of Object.entries(data)) {
        const ad = adData as any;
        const creative = ad?.creative;
        if (!creative) continue;

        // Priority: object_story_spec photo > link_data picture > image_url > thumbnail_url
        const spec = creative.object_story_spec;
        let bestUrl: string | null = null;

        if (spec?.photo_data?.url) {
          bestUrl = spec.photo_data.url;
        } else if (spec?.link_data?.picture) {
          bestUrl = spec.link_data.picture;
        } else if (spec?.link_data?.child_attachments?.[0]?.picture) {
          bestUrl = spec.link_data.child_attachments[0].picture;
        } else if (creative.image_url) {
          bestUrl = creative.image_url;
        } else if (creative.thumbnail_url) {
          bestUrl = creative.thumbnail_url;
        }

        if (bestUrl) {
          imageMap.set(adId, bestUrl);
        }
      }
    } catch (err) {
      console.warn(`Batch creative fetch error: ${err}`);
    }
  }

  console.log(`Resolved image URLs for ${imageMap.size} of ${adIds.length} ads`);
  return imageMap;
}

async function fetchAllAds(
  adAccountId: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<MetaAd[]> {
  const allAds: MetaAd[] = [];
  const fields = [
    "ad_id",
    "ad_name",
    "campaign_name",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "actions",
  ].join(",");

  const timeRange = JSON.stringify({ since: startDate, until: endDate });

  const filtering = JSON.stringify([
    {
      field: "campaign.name",
      operator: "CONTAIN",
      value: "hours",
    },
  ]);

  let url: string | null = `https://graph.facebook.com/v19.0/${adAccountId}/insights`;
  let params = new URLSearchParams({
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
    console.log(`Fetching page ${pageCount}...`);

    const response = await fetch(fetchUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Meta API error: ${errorText}`);
    }

    const data = await response.json();
    const rows = data.data || [];

    for (const row of rows) {
      const adName = row.ad_name || "";
      const upperAdName = adName.toUpperCase();

      if (!upperAdName.includes("IMAGE") && !upperAdName.includes("IMG")) {
        continue;
      }

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
        image_url: null, // will be populated later
      });
    }

    url = data.paging?.next || null;
  }

  console.log(`Fetched ${pageCount} pages, ${allAds.length} IMAGE/IMG ads`);

  // Now batch-fetch image URLs for all ads
  const adIds = allAds.map((a) => a.ad_id).filter(Boolean);
  const imageMap = await fetchAdImageUrls(adIds, accessToken);

  for (const ad of allAds) {
    ad.image_url = imageMap.get(ad.ad_id) || null;
  }

  return allAds;
}

function extractInstalls(actions: any[] | undefined): number {
  if (!actions) return 0;
  const installAction = actions.find(
    (a: any) => a.action_type === "mobile_app_install"
  );
  return installAction ? parseInt(installAction.value) || 0 : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate || "2025-10-01";
    const endDate =
      body.endDate ||
      new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

    if (!accessToken || !adAccountId) {
      throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID");
    }

    if (!adAccountId.startsWith("act_")) {
      adAccountId = `act_${adAccountId}`;
    }

    console.log(
      `Querying Meta API for Hours campaign ads (IMAGE/IMG) between ${startDate} and ${endDate}`
    );

    const ads = await fetchAllAds(adAccountId, accessToken, startDate, endDate);

    // Sort by spend descending
    ads.sort((a, b) => b.spend - a.spend);

    console.log(`Found ${ads.length} IMAGE/IMG ads from Hours campaigns`);

    return new Response(
      JSON.stringify({ success: true, data: { ads } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
