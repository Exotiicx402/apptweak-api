import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse creative name based on naming convention
function parseCreativeName(name: string): { conceptId: string; uniqueId: string; assetType: string } {
  const parts = name.split('|').map(p => p.trim());
  return {
    conceptId: parts[3] || '',
    uniqueId: parts[4] || '',
    assetType: parts[2] || '',
  };
}

// Sanitize filename for storage
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}

// Get file extension from URL or content type
function getExtension(url: string, contentType?: string): string {
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('mp4')) return 'mp4';
    if (contentType.includes('mov') || contentType.includes('quicktime')) return 'mov';
  }
  
  const urlPath = url.split('?')[0];
  const ext = urlPath.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  
  return 'jpg';
}

// Download asset and upload to Supabase Storage with shorter cache
async function downloadAndStoreAsset(
  supabase: any,
  originalUrl: string,
  storagePath: string,
  contentTypeHint?: string
): Promise<{ storedUrl: string; width?: number; height?: number } | null> {
  try {
    console.log(`Downloading: ${originalUrl.substring(0, 100)}...`);
    
    const response = await fetch(originalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CreativeAssetFetcher/1.0)',
      },
    });
    
    if (!response.ok) {
      console.error(`Download failed: ${response.status} - ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || contentTypeHint || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: contentType });
    
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
    console.log(`Uploading to: ${storagePath} (${sizeMB} MB, type: ${contentType})`);
    
    // Use shorter cache control so updates show faster
    const { error: uploadError } = await supabase.storage
      .from('creative-assets')
      .upload(storagePath, blob, {
        contentType,
        upsert: true,
        cacheControl: '3600', // 1 hour instead of 1 year
      });
    
    if (uploadError) {
      console.error(`Upload error: ${uploadError.message}`);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('creative-assets')
      .getPublicUrl(storagePath);
    
    return { storedUrl: publicUrl };
  } catch (error) {
    console.error(`Store error: ${error}`);
    return null;
  }
}

interface MetaCreativeData {
  creativeName: string;
  platformCreativeId: string;
  assetType: 'image' | 'video';
  imageUrl: string | null;
  imageHash: string | null;
  videoId: string | null;
  videoSourceUrl: string | null;
  videoPosterUrl: string | null;
}

// Fetch Meta creatives directly from the /adcreatives endpoint with pagination
async function fetchMetaCreatives(): Promise<MetaCreativeData[]> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
  
  if (!accessToken || !adAccountId) {
    console.log("Missing Meta credentials, skipping Meta creatives");
    return [];
  }
  
  if (!adAccountId.startsWith("act_")) {
    adAccountId = `act_${adAccountId}`;
  }
  
  const creatives: MetaCreativeData[] = [];
  const seenCreativeIds = new Set<string>();
  
  try {
    // Step 1: Get ad-to-name mapping from ads endpoint
    const adNameMap = new Map<string, string>();
    let adsUrl: string | null = `https://graph.facebook.com/v19.0/${adAccountId}/ads?fields=id,name,creative{id}&limit=500&access_token=${accessToken}`;
    
    console.log("Fetching ads for name mapping...");
    while (adsUrl) {
      const adsResponse: Response = await fetch(adsUrl);
      if (!adsResponse.ok) {
        console.error(`Ads API error: ${await adsResponse.text()}`);
        break;
      }
      
      const adsData: any = await adsResponse.json();
      for (const ad of adsData.data || []) {
        if (ad.creative?.id && ad.name) {
          adNameMap.set(ad.creative.id, ad.name);
        }
      }
      adsUrl = adsData.paging?.next || null;
    }
    console.log(`Mapped ${adNameMap.size} ad names`);
    
    // Step 2: Fetch all creatives from the /adcreatives endpoint with pagination
    let creativesUrl: string | null = `https://graph.facebook.com/v19.0/${adAccountId}/adcreatives?fields=id,name,object_type,image_url,image_hash,video_id&limit=100&access_token=${accessToken}`;
    
    console.log("Fetching creatives from /adcreatives endpoint...");
    let totalFetched = 0;
    
    while (creativesUrl) {
      const response: Response = await fetch(creativesUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Meta creatives API error: ${errorText}`);
        break;
      }
      
      const data: any = await response.json();
      const batchCreatives = data.data || [];
      totalFetched += batchCreatives.length;
      console.log(`Fetched batch of ${batchCreatives.length} creatives (total: ${totalFetched})`);
      
      for (const creative of batchCreatives) {
        if (!creative.id || seenCreativeIds.has(creative.id)) continue;
        seenCreativeIds.add(creative.id);
        
        // Use ad name if available, otherwise use creative name
        const creativeName = adNameMap.get(creative.id) || creative.name || '';
        if (!creativeName) continue;
        
        // Determine if video or image (no object_story_spec needed)
        const isVideo = creative.object_type === 'VIDEO' || !!creative.video_id;
        
        const creativeData: MetaCreativeData = {
          creativeName,
          platformCreativeId: creative.id,
          assetType: isVideo ? 'video' : 'image',
          imageUrl: creative.image_url || null,
          imageHash: creative.image_hash || null,
          videoId: isVideo ? (creative.video_id || null) : null,
          videoSourceUrl: null,
          videoPosterUrl: null,
        };
        
        creatives.push(creativeData);
      }
      
      // Follow pagination
      creativesUrl = data.paging?.next || null;
    }
    
    // Step 3: Batch fetch video source URLs for all videos
    const videoCreatives = creatives.filter(c => c.videoId);
    if (videoCreatives.length > 0) {
      console.log(`Fetching source URLs for ${videoCreatives.length} videos...`);
      
      // Create a map from videoId to creative indices
      const videoIdToCreatives = new Map<string, number[]>();
      creatives.forEach((c, idx) => {
        if (c.videoId) {
          const existing = videoIdToCreatives.get(c.videoId) || [];
          existing.push(idx);
          videoIdToCreatives.set(c.videoId, existing);
        }
      });
      
      const uniqueVideoIds = Array.from(videoIdToCreatives.keys());
      let videosWithSource = 0;
      let videosMissingSource = 0;
      
      // Batch fetch in groups of 50
      for (let i = 0; i < uniqueVideoIds.length; i += 50) {
        const batch = uniqueVideoIds.slice(i, i + 50);
        const videoUrl = `https://graph.facebook.com/v19.0/?ids=${batch.join(',')}&fields=id,source,picture&access_token=${accessToken}`;
        
        try {
          const videoResponse = await fetch(videoUrl);
          if (videoResponse.ok) {
            const videoData = await videoResponse.json();
            
            for (const [videoId, video] of Object.entries(videoData)) {
              const v = video as any;
              const indices = videoIdToCreatives.get(videoId) || [];
              
              for (const idx of indices) {
                if (v.source) {
                  creatives[idx].videoSourceUrl = v.source;
                  videosWithSource++;
                } else {
                  videosMissingSource++;
                }
                if (v.picture && !creatives[idx].videoPosterUrl) {
                  creatives[idx].videoPosterUrl = v.picture;
                }
              }
            }
          } else {
            const errorText = await videoResponse.text();
            console.warn(`Video batch fetch failed: ${errorText.substring(0, 200)}`);
          }
        } catch (e) {
          console.warn(`Video fetch error: ${e}`);
        }
      }
      
      console.log(`Video sources: ${videosWithSource} found, ${videosMissingSource} missing`);
    }
    
    // Step 4: Batch resolve image hashes to full-res URLs via Ad Images API
    const imageCreativesWithHash = creatives.filter(c => c.assetType === 'image' && c.imageHash);
    if (imageCreativesWithHash.length > 0) {
      console.log(`Resolving ${imageCreativesWithHash.length} image hashes via Ad Images API...`);
      
      // Collect unique hashes
      const hashToIndices = new Map<string, number[]>();
      creatives.forEach((c, idx) => {
        if (c.assetType === 'image' && c.imageHash) {
          const existing = hashToIndices.get(c.imageHash) || [];
          existing.push(idx);
          hashToIndices.set(c.imageHash, existing);
        }
      });
      
      const uniqueHashes = Array.from(hashToIndices.keys());
      let resolved = 0;
      
      // Batch in groups of 50
      for (let i = 0; i < uniqueHashes.length; i += 50) {
        const batch = uniqueHashes.slice(i, i + 50);
        const hashParam = batch.map(h => `'${h}'`).join(',');
        const adImagesUrl = `https://graph.facebook.com/v19.0/${adAccountId}/adimages?hashes=[${hashParam}]&fields=hash,url,name&access_token=${accessToken}`;
        
        try {
          const response = await fetch(adImagesUrl);
          if (response.ok) {
            const data = await response.json();
            for (const img of data.data || []) {
              if (img.hash && img.url) {
                const indices = hashToIndices.get(img.hash) || [];
                for (const idx of indices) {
                  // Override imageUrl with full-res URL from Ad Images API
                  creatives[idx].imageUrl = img.url;
                  resolved++;
                }
              }
            }
          } else {
            const errorText = await response.text();
            console.warn(`Ad Images API error: ${errorText.substring(0, 200)}`);
          }
        } catch (e) {
          console.warn(`Ad Images API fetch error: ${e}`);
        }
      }
      
      console.log(`Resolved ${resolved} image hashes to full-res URLs`);
    }
    
    console.log(`Total Meta creatives extracted: ${creatives.length}`);
  } catch (error) {
    console.error(`Error fetching Meta creatives: ${error}`);
  }
  
  return creatives;
}

// Fetch Moloco creatives via /cm/v1/creatives endpoint
async function fetchMolocoCreatives(): Promise<Array<{
  creativeName: string;
  platformCreativeId: string;
  imageUrl: string | null;
  assetType: string;
  width: number | null;
  height: number | null;
}>> {
  const apiKey = Deno.env.get('MOLOCO_API_KEY');
  const adAccountId = Deno.env.get('MOLOCO_AD_ACCOUNT_ID');

  if (!apiKey || !adAccountId) {
    console.log("Missing Moloco credentials, skipping");
    return [];
  }

  const creatives: Array<{
    creativeName: string;
    platformCreativeId: string;
    imageUrl: string | null;
    assetType: string;
    width: number | null;
    height: number | null;
  }> = [];

  try {
    // Get auth token
    console.log("Getting Moloco access token...");
    const authResponse = await fetch('https://api.moloco.cloud/cm/v1/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!authResponse.ok) {
      console.error(`Moloco auth error: ${await authResponse.text()}`);
      return [];
    }

    const authData = await authResponse.json();
    const token = authData.token;

    // Fetch all creatives
    console.log("Fetching Moloco creatives...");
    const creativesResponse = await fetch(
      `https://api.moloco.cloud/cm/v1/creatives?ad_account_id=${adAccountId}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    if (!creativesResponse.ok) {
      console.error(`Moloco creatives error: ${await creativesResponse.text()}`);
      return [];
    }

    const creativesData = await creativesResponse.json();
    const items = creativesData.creatives || [];
    console.log(`Found ${items.length} Moloco creatives`);

    // Also fetch creative groups to map creative IDs to ad group titles
    console.log("Fetching Moloco creative groups...");
    const groupsResponse = await fetch(
      `https://api.moloco.cloud/cm/v1/creative-groups?ad_account_id=${adAccountId}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
    );

    const creativeIdToGroupTitle = new Map<string, string>();
    if (groupsResponse.ok) {
      const groupsData = await groupsResponse.json();
      for (const group of groupsData.creative_groups || []) {
        const groupTitle = group.title || '';
        for (const cId of group.creative_ids || []) {
          creativeIdToGroupTitle.set(cId, groupTitle);
        }
      }
      console.log(`Mapped ${creativeIdToGroupTitle.size} creative-to-group associations`);
    }

    for (const item of items) {
      const creativeId = item.id || '';
      if (!creativeId) continue;

      // Use group title as creative name if available, otherwise use creative title
      const creativeName = creativeIdToGroupTitle.get(creativeId) || item.title || creativeId;

      // Extract image URL from the creative
      const imageUrl = item.image_url || item.image_src?.image_url || null;
      const isVideo = item.type === 'VIDEO' || item.type === 'NATIVE_VIDEO';

      creatives.push({
        creativeName,
        platformCreativeId: creativeId,
        imageUrl,
        assetType: isVideo ? 'video' : 'image',
        width: item.width ? parseInt(item.width, 10) : null,
        height: item.height ? parseInt(item.height, 10) : null,
      });
    }

    console.log(`Extracted ${creatives.length} Moloco creatives (${creatives.filter(c => c.imageUrl).length} with image URLs)`);
  } catch (error) {
    console.error(`Error fetching Moloco creatives: ${error}`);
  }

  return creatives;
}

// Fetch Snapchat ad creatives
async function fetchSnapchatCreatives(): Promise<Array<{
  creativeName: string;
  platformCreativeId: string;
  thumbnailUrl: string;
  assetType: string;
}>> {
  const clientId = Deno.env.get('SNAPCHAT_CLIENT_ID');
  const clientSecret = Deno.env.get('SNAPCHAT_CLIENT_SECRET');
  const refreshToken = Deno.env.get('SNAPCHAT_REFRESH_TOKEN');
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  
  if (!clientId || !clientSecret || !refreshToken || !adAccountId) {
    console.log("Missing Snapchat credentials, skipping");
    return [];
  }
  
  const creatives: Array<{
    creativeName: string;
    platformCreativeId: string;
    thumbnailUrl: string;
    assetType: string;
  }> = [];
  
  try {
    console.log("Getting Snapchat access token...");
    const tokenResponse = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
    
    if (!tokenResponse.ok) {
      console.error(`Snapchat token error: ${await tokenResponse.text()}`);
      return [];
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    console.log("Fetching Snapchat ads...");
    const adsResponse = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/ads?limit=500`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!adsResponse.ok) {
      console.error(`Snapchat ads error: ${await adsResponse.text()}`);
      return [];
    }
    
    const adsData = await adsResponse.json();
    console.log(`Found ${adsData.ads?.length || 0} Snapchat ads`);
    
    const adCreativeMap = new Map<string, string>();
    for (const wrapper of adsData.ads || []) {
      const ad = wrapper.ad;
      if (ad?.name && ad?.creative_id) {
        adCreativeMap.set(ad.creative_id, ad.name);
      }
    }
    
    console.log("Fetching Snapchat creatives...");
    const creativesResponse = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/creatives?limit=500`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!creativesResponse.ok) {
      console.error(`Snapchat creatives error: ${await creativesResponse.text()}`);
      return [];
    }
    
    const creativesData = await creativesResponse.json();
    
    const mediaIds: string[] = [];
    const creativeMediaMap = new Map<string, string>();
    
    for (const wrapper of creativesData.creatives || []) {
      const creative = wrapper.creative;
      if (creative?.top_snap_media_id) {
        mediaIds.push(creative.top_snap_media_id);
        creativeMediaMap.set(creative.top_snap_media_id, creative.id);
      }
    }
    
    console.log(`Fetching ${mediaIds.length} Snapchat media items...`);
    for (const mediaId of mediaIds.slice(0, 100)) {
      try {
        const mediaResponse = await fetch(
          `https://adsapi.snapchat.com/v1/media/${mediaId}/preview`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          const creativeId = creativeMediaMap.get(mediaId) || '';
          const adName = adCreativeMap.get(creativeId) || '';
          
          if (adName && mediaData.preview_url) {
            creatives.push({
              creativeName: adName,
              platformCreativeId: creativeId,
              thumbnailUrl: mediaData.preview_url,
              assetType: mediaData.type === 'VIDEO' ? 'video' : 'image',
            });
          }
        }
      } catch (error) {
        console.warn(`Error fetching media ${mediaId}: ${error}`);
      }
    }
    
    console.log(`Extracted ${creatives.length} Snapchat creatives`);
  } catch (error) {
    console.error(`Error fetching Snapchat creatives: ${error}`);
  }
  
  return creatives;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    let platforms = ['meta', 'snapchat', 'moloco'];
    let forceRefresh = false;
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.platforms && Array.isArray(body.platforms)) {
          platforms = body.platforms;
        }
        forceRefresh = body.forceRefresh === true;
      } catch {
        // Use defaults
      }
    }
    
    console.log(`=== Fetching creative assets for: ${platforms.join(', ')} (force=${forceRefresh}) ===`);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get existing assets
    const { data: existingAssets } = await supabase
      .from('creative_assets')
      .select('platform, platform_creative_id, full_asset_url');
    
    const existingSet = new Set(
      (existingAssets || []).map(a => `${a.platform}:${a.platform_creative_id}`)
    );
    const hasFullAsset = new Set(
      (existingAssets || []).filter(a => a.full_asset_url).map(a => `${a.platform}:${a.platform_creative_id}`)
    );
    console.log(`Existing: ${existingSet.size}, with full assets: ${hasFullAsset.size}`);
    
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      videosDownloaded: 0,
      videosWithSource: 0,
      videosMissingSource: 0,
      imagesDownloaded: 0,
      postersDownloaded: 0,
      byPlatform: {} as Record<string, { processed: number; skipped: number; errors: number }>,
    };
    
    // Process Meta creatives
    if (platforms.includes('meta')) {
      results.byPlatform.meta = { processed: 0, skipped: 0, errors: 0 };
      
      const metaCreatives = await fetchMetaCreatives();
      console.log(`Processing ${metaCreatives.length} Meta creatives...`);
      
      for (const creative of metaCreatives) {
        const existingKey = `meta:${creative.platformCreativeId}`;
        
        // Skip if already has full asset (unless force refresh)
        if (!forceRefresh && hasFullAsset.has(existingKey)) {
          results.skipped++;
          results.byPlatform.meta.skipped++;
          continue;
        }
        
        const { conceptId, uniqueId } = parseCreativeName(creative.creativeName);
        const safeConceptId = sanitizeFilename(conceptId || 'unknown');
        const safeUniqueId = sanitizeFilename(uniqueId || creative.platformCreativeId);
        
        let fullAssetUrl: string | null = null;
        let posterUrl: string | null = null;
        let thumbnailUrl: string | null = null;
        
        if (creative.assetType === 'video') {
          // Download video MP4 if source URL is available
          if (creative.videoSourceUrl) {
            console.log(`Downloading video for: ${creative.creativeName.substring(0, 50)}...`);
            const videoPath = `meta/${safeConceptId}/${safeUniqueId}.mp4`;
            const videoResult = await downloadAndStoreAsset(
              supabase,
              creative.videoSourceUrl,
              videoPath,
              'video/mp4'
            );
            if (videoResult) {
              fullAssetUrl = videoResult.storedUrl;
              results.videosDownloaded++;
              results.videosWithSource++;
              console.log(`✓ Video stored: ${videoPath}`);
            }
          } else {
            results.videosMissingSource++;
            console.log(`⚠ No video source for: ${creative.creativeName.substring(0, 50)}...`);
          }
          
          // Download video poster (high-res picture from video endpoint)
          if (creative.videoPosterUrl) {
            const posterPath = `meta/${safeConceptId}/${safeUniqueId}_poster.jpg`;
            const posterResult = await downloadAndStoreAsset(
              supabase,
              creative.videoPosterUrl,
              posterPath,
              'image/jpeg'
            );
            if (posterResult) {
              posterUrl = posterResult.storedUrl;
              thumbnailUrl = posterResult.storedUrl;
              results.postersDownloaded++;
            }
          }
        } else {
          // Image ads - download full-res image
          if (creative.imageUrl) {
            const ext = getExtension(creative.imageUrl);
            const imagePath = `meta/${safeConceptId}/${safeUniqueId}.${ext}`;
            const imageResult = await downloadAndStoreAsset(
              supabase,
              creative.imageUrl,
              imagePath
            );
            if (imageResult) {
              fullAssetUrl = imageResult.storedUrl;
              thumbnailUrl = imageResult.storedUrl;
              results.imagesDownloaded++;
              console.log(`✓ Image stored: ${imagePath}`);
            }
          }
        }
        
        // Only save if we got at least one asset
        if (fullAssetUrl || posterUrl || thumbnailUrl) {
          const { error: upsertError } = await supabase
            .from('creative_assets')
            .upsert({
              creative_name: creative.creativeName,
              concept_id: conceptId || null,
              unique_identifier: uniqueId || null,
              platform: 'meta',
              platform_creative_id: creative.platformCreativeId,
              asset_type: creative.assetType,
              thumbnail_url: thumbnailUrl,
              full_asset_url: fullAssetUrl,
              poster_url: posterUrl,
              original_url: creative.imageUrl || creative.videoSourceUrl || creative.videoPosterUrl,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'platform,platform_creative_id',
            });
          
          if (upsertError) {
            console.error(`Upsert error: ${upsertError.message}`);
            results.errors++;
            results.byPlatform.meta.errors++;
            continue;
          }
          
          results.processed++;
          results.byPlatform.meta.processed++;
        } else {
          console.warn(`No assets found for: ${creative.creativeName.substring(0, 50)}...`);
          results.errors++;
          results.byPlatform.meta.errors++;
        }
      }
    }
    
    // Process Snapchat creatives
    if (platforms.includes('snapchat')) {
      results.byPlatform.snapchat = { processed: 0, skipped: 0, errors: 0 };
      
      const snapchatCreatives = await fetchSnapchatCreatives();
      
      for (const creative of snapchatCreatives) {
        const existingKey = `snapchat:${creative.platformCreativeId}`;
        
        if (!forceRefresh && hasFullAsset.has(existingKey)) {
          results.skipped++;
          results.byPlatform.snapchat.skipped++;
          continue;
        }
        
        const { conceptId, uniqueId } = parseCreativeName(creative.creativeName);
        const safeConceptId = sanitizeFilename(conceptId || 'unknown');
        const safeUniqueId = sanitizeFilename(uniqueId || creative.platformCreativeId);
        
        const ext = getExtension(creative.thumbnailUrl);
        const storagePath = `snapchat/${safeConceptId}/${safeUniqueId}.${ext}`;
        
        const stored = await downloadAndStoreAsset(
          supabase,
          creative.thumbnailUrl,
          storagePath
        );
        
        if (!stored) {
          results.errors++;
          results.byPlatform.snapchat.errors++;
          continue;
        }
        
        const { error: upsertError } = await supabase
          .from('creative_assets')
          .upsert({
            creative_name: creative.creativeName,
            concept_id: conceptId || null,
            unique_identifier: uniqueId || null,
            platform: 'snapchat',
            platform_creative_id: creative.platformCreativeId,
            asset_type: creative.assetType,
            thumbnail_url: stored.storedUrl,
            full_asset_url: stored.storedUrl,
            original_url: creative.thumbnailUrl,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'platform,platform_creative_id',
          });
        
        if (upsertError) {
          console.error(`Upsert error: ${upsertError.message}`);
          results.errors++;
          results.byPlatform.snapchat.errors++;
          continue;
        }
        
        results.processed++;
        results.byPlatform.snapchat.processed++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`=== Completed in ${duration}ms ===`);
    console.log(`Processed: ${results.processed}, Skipped: ${results.skipped}, Errors: ${results.errors}`);
    console.log(`Videos: ${results.videosDownloaded} downloaded (${results.videosWithSource} with source, ${results.videosMissingSource} missing)`);
    console.log(`Images: ${results.imagesDownloaded}, Posters: ${results.postersDownloaded}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});