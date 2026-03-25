import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Layer 2: On-demand HD media resolution.
 * - For images: resolves HD URL via adimages API using image hash
 * - For videos: gets preview iframe URL via Ad Preview API (video source requires special perms)
 * Results cached in creative_media_cache table.
 */

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function resolveImageHD(accountId: string, imageHash: string, accessToken: string): Promise<string | null> {
  const url = `https://graph.facebook.com/v21.0/${accountId}/adimages?hashes=['${imageHash}']&fields=hash,url,permalink_url&access_token=${accessToken}`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`adimages error: ${await resp.text()}`);
      return null;
    }
    const data = await resp.json();
    for (const img of data.data || []) {
      if (img.url && !img.url.includes("p64x64")) {
        return img.url;
      }
    }
  } catch (e) {
    console.error(`Image resolve error: ${e}`);
  }
  return null;
}

async function resolveVideoPreview(adId: string, accessToken: string): Promise<string | null> {
  const url = `https://graph.facebook.com/v21.0/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${accessToken}`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Preview API error: ${await resp.text()}`);
      return null;
    }
    const data = await resp.json();
    const preview = data.data?.[0];
    if (!preview?.body) return null;

    // Extract iframe src from the HTML
    const srcMatch = preview.body.match(/src="([^"]+)"/);
    if (!srcMatch) return null;

    // Decode HTML entities
    return srcMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  } catch (e) {
    console.error(`Video preview error: ${e}`);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mediaType, imageHash, videoId, adId } = body;

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    let accountId = Deno.env.get("META_AD_ACCOUNT_ID");
    if (!accessToken || !accountId) throw new Error("Missing META credentials");
    if (!accountId.startsWith("act_")) accountId = `act_${accountId}`;

    const supabase = getSupabase();
    const mediaId = imageHash || videoId || adId;

    // Check cache first
    const { data: cached } = await supabase
      .from("creative_media_cache")
      .select("hd_url, media_type")
      .eq("account_id", accountId)
      .eq("media_id", mediaId)
      .maybeSingle();

    if (cached?.hd_url) {
      console.log(`Cache hit for ${mediaId}`);
      return new Response(
        JSON.stringify({ success: true, data: { hdUrl: cached.hd_url, mediaType: cached.media_type, cached: true } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let hdUrl: string | null = null;
    let resolvedType = mediaType || "image";

    if (mediaType === "video" && adId) {
      hdUrl = await resolveVideoPreview(adId, accessToken);
      resolvedType = "video";
    } else if (imageHash) {
      hdUrl = await resolveImageHD(accountId, imageHash, accessToken);
      resolvedType = "image";
    }

    // Cache the result
    if (hdUrl) {
      await supabase.from("creative_media_cache").upsert({
        account_id: accountId,
        media_id: mediaId,
        media_type: resolvedType,
        hd_url: hdUrl,
      }, { onConflict: "account_id,media_id" });
    }

    return new Response(
      JSON.stringify({ success: true, data: { hdUrl, mediaType: resolvedType, cached: false } }),
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
