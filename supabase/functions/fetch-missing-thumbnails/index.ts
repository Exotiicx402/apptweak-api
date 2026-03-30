import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').substring(0, 100);
}

function getExtension(url: string, contentType?: string): string {
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
  }
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return 'jpg';
}

function parseCreativeName(name: string): { conceptId: string; uniqueId: string } {
  const parts = name.split('|').map(p => p.trim());
  return { conceptId: parts[3] || '', uniqueId: parts[4] || '' };
}

const LOW_RES_DIMENSION_THRESHOLD = 220;

function isLikelyLowResUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();

  if (lower.includes('p64x64')) return true;
  if (/\/s\d{1,3}x\d{1,3}\//i.test(lower)) return true;

  const width = lower.match(/[?&](?:w|width)=(\d{1,4})/i)?.[1];
  const height = lower.match(/[?&](?:h|height)=(\d{1,4})/i)?.[1];
  if ((width && Number(width) <= LOW_RES_DIMENSION_THRESHOLD) || (height && Number(height) <= LOW_RES_DIMENSION_THRESHOLD)) {
    return true;
  }

  return false;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getImageArea(image: any): number {
  const width = toNumber(image?.original_width ?? image?.width);
  const height = toNumber(image?.original_height ?? image?.height);
  return width * height;
}

function collectCreativeImageHashes(detail: any): string[] {
  const hashes = new Set<string>();

  if (detail?.image_hash) hashes.add(detail.image_hash);

  const spec = detail?.object_story_spec;
  const linkData = spec?.link_data;
  const photoData = spec?.photo_data;

  if (linkData?.image_hash) hashes.add(linkData.image_hash);
  if (photoData?.image_hash) hashes.add(photoData.image_hash);

  if (Array.isArray(photoData?.images)) {
    for (const image of photoData.images) {
      if (image?.hash) hashes.add(image.hash);
    }
  }

  return Array.from(hashes);
}

function resolveBestImageUrl(detail: any): { url: string | null; source: string } {
  const spec = detail?.object_story_spec;
  const linkData = spec?.link_data;
  const photoData = spec?.photo_data;
  const photoImages = Array.isArray(photoData?.images)
    ? [...photoData.images].sort((a: any, b: any) => getImageArea(b) - getImageArea(a))
    : [];

  const candidates: Array<{ url: string | null | undefined; source: string }> = [
    { url: detail?.resolvedImageUrl, source: 'adimages(hash)' },
    { url: detail?.full_picture, source: 'full_picture(post)' },
    { url: linkData?.image_url, source: 'object_story_spec.link_data.image_url' },
    { url: photoImages[0]?.url, source: 'object_story_spec.photo_data.images[0].url' },
    { url: detail?.image_url, source: 'creative.image_url' },
    { url: photoData?.url, source: 'object_story_spec.photo_data.url' },
    { url: linkData?.picture, source: 'object_story_spec.link_data.picture' },
    { url: detail?.thumbnail_url, source: 'creative.thumbnail_url' },
  ];

  for (const candidate of candidates) {
    if (!candidate.url) continue;
    if (isLikelyLowResUrl(candidate.url)) continue;
    return { url: candidate.url, source: candidate.source };
  }

  return { url: null, source: 'none' };
}

function getHighResFacebookUrlCandidates(url: string): string[] {
  const candidates = new Set<string>([url]);

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isFacebookCdn = host.includes('fbcdn.net') || host.includes('facebook.com');
    if (!isFacebookCdn) return Array.from(candidates);

    const noResize = new URL(parsed.toString());
    for (const key of ['stp', 'w', 'h', 'width', 'height']) {
      noResize.searchParams.delete(key);
    }
    candidates.add(noResize.toString());

    const pathUpscaled = new URL(noResize.toString());
    pathUpscaled.pathname = pathUpscaled.pathname
      .replace(/\/p64x64\//gi, '/p1080x1080/')
      .replace(/\/s64x64\//gi, '/s1080x1080/')
      .replace(/\/s\d{1,3}x\d{1,3}\//gi, '/s1080x1080/');
    candidates.add(pathUpscaled.toString());
  } catch {
    return Array.from(candidates);
  }

  return Array.from(candidates).filter((candidate) => !isLikelyLowResUrl(candidate));
}

async function downloadAndStore(
  supabase: any, url: string, path: string, hint?: string
): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || hint || 'application/octet-stream';
    const blob = new Blob([await res.arrayBuffer()], { type: ct });
    const { error } = await supabase.storage.from('creative-assets').upload(path, blob, {
      contentType: ct, upsert: true, cacheControl: '3600',
    });
    if (error) { console.error(`Upload error: ${error.message}`); return null; }
    const { data: { publicUrl } } = supabase.storage.from('creative-assets').getPublicUrl(path);
    return publicUrl;
  } catch (e) { console.error(`Store error: ${e}`); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { missingNames } = await req.json();
    if (!missingNames || !Array.isArray(missingNames) || missingNames.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No missing names provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`=== Fetching thumbnails for ${missingNames.length} missing creatives ===`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
    if (!accessToken || !adAccountId) {
      return new Response(JSON.stringify({ success: false, error: "Missing Meta credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;

    // Canonicalize missing names for matching
    const canonicalize = (n: string) => n.replace(/\s*\|\s*/g, " | ").replace(/\s+/g, " ").trim().toLowerCase();
    const missingSet = new Set(missingNames.map(canonicalize));
    console.log(`Looking for ${missingSet.size} unique missing creatives`);

    // Fetch all ads from Meta to find matching ones
    const matchedAds: Array<{ adName: string; creativeId: string }> = [];
    let adsUrl: string | null = `https://graph.facebook.com/v19.0/${adAccountId}/ads?fields=id,name,creative{id}&limit=500&access_token=${accessToken}`;

    while (adsUrl && matchedAds.length < missingSet.size * 2) {
      const res = await fetch(adsUrl);
      if (!res.ok) break;
      const data: any = await res.json();
      for (const ad of data.data || []) {
        if (ad.creative?.id && ad.name) {
          const canon = canonicalize(ad.name);
          if (missingSet.has(canon)) {
            matchedAds.push({ adName: ad.name, creativeId: ad.creative.id });
          }
        }
      }
      adsUrl = data.paging?.next || null;
    }

    console.log(`Matched ${matchedAds.length} ads from Meta API`);
    if (matchedAds.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No matching ads found in Meta" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Deduplicate by creative ID
    const uniqueCreatives = new Map<string, string>();
    for (const ad of matchedAds) {
      if (!uniqueCreatives.has(ad.creativeId)) {
        uniqueCreatives.set(ad.creativeId, ad.adName);
      }
    }

    // Batch fetch creative details (image_url, image_hash, video_id)
    const creativeIds = Array.from(uniqueCreatives.keys());
    const creativeDetails = new Map<string, any>();

    for (let i = 0; i < creativeIds.length; i += 25) {
      const batch = creativeIds.slice(i, i + 25);
      const url = `https://graph.facebook.com/v19.0/?ids=${batch.join(',')}&fields=id,object_type,image_url,image_hash,video_id,thumbnail_url,object_story_spec&access_token=${accessToken}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          for (const [id, detail] of Object.entries(data)) {
            creativeDetails.set(id, detail);
          }
        } else {
          console.warn(`Batch fetch status ${res.status}: ${await res.text()}`);
        }
      } catch (e) { console.warn(`Batch fetch error: ${e}`); }
    }

    console.log(`Got details for ${creativeDetails.size} creatives`);
    // Log a sample detail for debugging
    for (const [id, detail] of creativeDetails) {
      console.log(`Sample creative ${id}: ${JSON.stringify(detail).substring(0, 300)}`);
      break;
    }

    // Resolve image hashes to full-res URLs
    const hashToIds = new Map<string, string[]>();
    for (const [id, detail] of creativeDetails) {
      const d = detail as any;
      if (d.object_type === 'VIDEO') continue;
      const hashes = collectCreativeImageHashes(d);
      for (const hash of hashes) {
        const ids = hashToIds.get(hash) || [];
        ids.push(id);
        hashToIds.set(hash, ids);
      }
    }

    if (hashToIds.size > 0) {
      const hashes = Array.from(hashToIds.keys());
      for (let i = 0; i < hashes.length; i += 50) {
        const batch = hashes.slice(i, i + 50);
        const hashParam = batch.map(h => `'${h}'`).join(',');
        const url = `https://graph.facebook.com/v19.0/${adAccountId}/adimages?hashes=[${hashParam}]&fields=hash,url,width,height,original_width,original_height&access_token=${accessToken}`;
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            for (const img of data.data || []) {
              if (img.hash && img.url) {
                for (const id of hashToIds.get(img.hash) || []) {
                  const d = creativeDetails.get(id) as any;
                  if (!d) continue;
                  const currentArea = getImageArea(d.resolvedImageMeta);
                  const nextArea = getImageArea(img);
                  if (!d.resolvedImageUrl || nextArea >= currentArea) {
                    d.resolvedImageUrl = img.url;
                    d.resolvedImageMeta = {
                      width: img.original_width ?? img.width,
                      height: img.original_height ?? img.height,
                    };
                  }
                }
              }
            }
          }
        } catch (e) { console.warn(`Ad images error: ${e}`); }
      }
    }

    // Resolve video posters
    const videoIds = Array.from(creativeDetails.entries())
      .filter(([_, d]) => (d as any).video_id)
      .map(([_, d]) => (d as any).video_id);

    if (videoIds.length > 0) {
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const url = `https://graph.facebook.com/v19.0/?ids=${batch.join(',')}&fields=id,picture,source&access_token=${accessToken}`;
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            for (const [vid, vdata] of Object.entries(data)) {
              const v = vdata as any;
              // Find creative with this video_id and attach poster
              for (const [cid, detail] of creativeDetails) {
                const d = detail as any;
                if (d.video_id === vid) {
                  d.videoPosterUrl = v.picture || null;
                  d.videoSourceUrl = v.source || null;
                }
              }
            }
          }
        } catch (e) { console.warn(`Video fetch error: ${e}`); }
      }
    }

    // Download and store assets
    let processed = 0, errors = 0;

    for (const [creativeId, adName] of uniqueCreatives) {
      const detail = creativeDetails.get(creativeId) as any;
      if (!detail) continue;

      const { conceptId, uniqueId } = parseCreativeName(adName);
      const safeConcept = sanitizeFilename(conceptId || 'unknown');
      const safeUnique = sanitizeFilename(uniqueId || creativeId);

      const isVideo = detail.object_type === 'VIDEO' || !!detail.video_id;
      let thumbnailUrl: string | null = null;
      let fullAssetUrl: string | null = null;
      let posterUrl: string | null = null;

      if (isVideo) {
        // Store video poster as thumbnail
        const videoPoster = detail.videoPosterUrl || detail.thumbnail_url;
        if (videoPoster) {
          const path = `meta/${safeConcept}/${safeUnique}_poster.jpg`;
          const stored = await downloadAndStore(supabase, videoPoster, path, 'image/jpeg');
          if (stored) { posterUrl = stored; thumbnailUrl = stored; }
        }
        if (detail.videoSourceUrl) {
          const path = `meta/${safeConcept}/${safeUnique}.mp4`;
          const stored = await downloadAndStore(supabase, detail.videoSourceUrl, path, 'video/mp4');
          if (stored) fullAssetUrl = stored;
        }
      } else {
        const resolved = resolveBestImageUrl(detail);
        const imageCandidates = resolved.url ? getHighResFacebookUrlCandidates(resolved.url) : [];
        console.log(`Image creative ${creativeId}: resolved=${!!resolved.url}, source=${resolved.source}, candidates=${imageCandidates.length}, object_type=${detail.object_type}`);
        let storedAny = false;
        for (const candidateUrl of imageCandidates) {
          const ext = getExtension(candidateUrl);
          const path = `meta/${safeConcept}/${safeUnique}.${ext}`;
          const stored = await downloadAndStore(supabase, candidateUrl, path);
          if (stored) {
            fullAssetUrl = stored;
            thumbnailUrl = stored;
            detail.resolvedImageUrl = candidateUrl;
            storedAny = true;
            break;
          }
        }

        if (!storedAny) {
          console.log(`Skipped ${creativeId}: no HD-capable image URL found (low-res-only candidates).`);
        }
      }

      if (thumbnailUrl || fullAssetUrl || posterUrl) {
        const { error } = await supabase.from('creative_assets').upsert({
          creative_name: adName,
          concept_id: conceptId || null,
          unique_identifier: uniqueId || null,
          platform: 'meta',
          platform_creative_id: creativeId,
          asset_type: isVideo ? 'video' : 'image',
          thumbnail_url: thumbnailUrl,
          full_asset_url: fullAssetUrl,
          poster_url: posterUrl,
            original_url: detail.resolvedImageUrl || detail.image_url || detail.videoSourceUrl || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'platform,platform_creative_id' });

        if (error) { console.error(`Upsert error: ${error.message}`); errors++; }
        else { processed++; console.log(`✓ Stored: ${adName.substring(0, 60)}`); }
      } else {
        errors++;
      }
    }

    console.log(`=== Done: ${processed} processed, ${errors} errors ===`);
    return new Response(JSON.stringify({ success: true, processed, errors, matched: matchedAds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error(`Fatal: ${error}`);
    return new Response(JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
