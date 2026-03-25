import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Layer 2 (batch): Downloads images from Meta and re-hosts in Supabase Storage.
 * Avoids Meta CDN token expiration by permanently storing assets.
 */

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function downloadAndStore(
  supabase: any,
  sourceUrl: string,
  storagePath: string
): Promise<{ storedUrl: string; fileSize: number } | null> {
  try {
    const resp = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CreativeBackfill/1.0)" },
    });
    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await resp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: contentType });

    const { error } = await supabase.storage
      .from("creative-assets")
      .upload(storagePath, blob, { contentType, upsert: true, cacheControl: "3600" });

    if (error) {
      console.error(`Upload error for ${storagePath}: ${error.message}`);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("creative-assets")
      .getPublicUrl(storagePath);

    return { storedUrl: publicUrl, fileSize: arrayBuffer.byteLength };
  } catch (e) {
    console.error(`Download error: ${e}`);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 50;

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    let accountId = Deno.env.get("META_AD_ACCOUNT_ID");
    if (!accessToken || !accountId) throw new Error("Missing META credentials");
    if (!accountId.startsWith("act_")) accountId = `act_${accountId}`;

    const supabase = getSupabase();

    // Get already-processed creative IDs
    const { data: processed } = await supabase
      .from("processed_creative_assets")
      .select("creative_id")
      .eq("account_id", accountId);
    const processedSet = new Set((processed || []).map((r: any) => r.creative_id));

    // Get cached ads with creative data
    const { data: cachedAds } = await supabase
      .from("ad_creatives_daily_cache")
      .select("ad_id, ad_data")
      .eq("account_id", accountId)
      .not("ad_data", "eq", "{}");

    // Deduplicate by ad_id and collect unprocessed
    const uniqueAds = new Map<string, any>();
    for (const row of cachedAds || []) {
      if (!processedSet.has(row.ad_id) && !uniqueAds.has(row.ad_id)) {
        uniqueAds.set(row.ad_id, row.ad_data);
      }
    }

    const toProcess = Array.from(uniqueAds.entries()).slice(0, limit);
    console.log(`Found ${uniqueAds.size} unprocessed ads, processing ${toProcess.length}`);

    let stored = 0;
    let skipped = 0;
    let errors = 0;

    for (const [adId, adData] of toProcess) {
      const creative = adData?.creative;
      if (!creative) { console.log(`Skip ${adId}: no creative`); skipped++; continue; }

      const imageHash = creative.image_hash ||
        creative.object_story_spec?.link_data?.image_hash ||
        creative.object_story_spec?.photo_data?.image_hash ||
        creative.asset_feed_spec?.images?.[0]?.hash;
      const videoId = creative.object_story_spec?.video_data?.video_id ||
        creative.asset_feed_spec?.videos?.[0]?.video_id;

      let sourceUrl: string | null = null;
      let mediaType = "image";

      console.log(`Ad ${adId}: imageHash=${imageHash}, videoId=${videoId}`);

      if (imageHash) {
        const hashUrl = `https://graph.facebook.com/v21.0/${accountId}/adimages?hashes=${encodeURIComponent(JSON.stringify([imageHash]))}&fields=hash,url&access_token=${accessToken}`;
        try {
          const resp = await fetch(hashUrl);
          if (resp.ok) {
            const data = await resp.json();
            const img = (data.data || [])[0];
            console.log(`Hash ${imageHash} resolved: ${img?.url?.substring(0, 80) || 'none'}`);
            if (img?.url && !img.url.includes("p64x64")) {
              sourceUrl = img.url;
            }
          } else {
            console.error(`Adimages API error: ${await resp.text()}`);
          }
        } catch (e) { console.error(`Hash fetch error: ${e}`); }
      } else if (videoId) {
        // Get video thumbnail
        mediaType = "video";
        const thumbUrl = `https://graph.facebook.com/v21.0/${videoId}?fields=thumbnails{uri,height,width,is_preferred}&access_token=${accessToken}`;
        try {
          const resp = await fetch(thumbUrl);
          if (resp.ok) {
            const data = await resp.json();
            const thumbs = data.thumbnails?.data || [];
            // Pick largest or preferred thumbnail
            const preferred = thumbs.find((t: any) => t.is_preferred) || thumbs.sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
            if (preferred?.uri) sourceUrl = preferred.uri;
          }
        } catch { /* skip */ }
      }

      // Fallback: use creative image_url or thumbnail_url (skip p64x64)
      if (!sourceUrl) {
        const candidates = [
          creative.image_url,
          creative.object_story_spec?.link_data?.image_url,
          creative.object_story_spec?.link_data?.picture,
          creative.object_story_spec?.video_data?.image_url,
          creative.object_story_spec?.photo_data?.url,
          creative.asset_feed_spec?.images?.[0]?.url,
          creative.thumbnail_url,
        ].filter(Boolean);

        sourceUrl = candidates.find((u: string) => !u.includes("p64x64")) || null;
      }

      if (!sourceUrl) { skipped++; continue; }

      const ext = mediaType === "video" ? "jpg" : "jpg"; // thumbnails are always images
      const storagePath = `${accountId.replace("act_", "")}/${adId}.${ext}`;
      const result = await downloadAndStore(supabase, sourceUrl, storagePath);

      if (result) {
        await supabase.from("processed_creative_assets").upsert({
          account_id: accountId,
          creative_id: adId,
          media_type: mediaType,
          original_url: sourceUrl,
          stored_url: result.storedUrl,
          file_size: result.fileSize,
        }, { onConflict: "account_id,creative_id,media_type" });
        stored++;
      } else {
        errors++;
      }

      // Rate limit delay
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Done. Stored: ${stored}, skipped: ${skipped}, errors: ${errors}`);

    return new Response(
      JSON.stringify({ success: true, data: { stored, skipped, errors, total: toProcess.length } }),
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
