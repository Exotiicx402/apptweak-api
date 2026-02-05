import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse creative name based on naming convention:
// Page | ContentType | AssetType | ConceptID | Category | Angle | UNIQUEIDENTIFIER | Tactic | CreativeOwner | Objective | INPUT-LP-HERE | LaunchDate
function parseCreativeName(name: string): { conceptId: string; uniqueId: string } {
  const parts = name.split('|').map(p => p.trim());
  return {
    conceptId: parts[3] || '',
    uniqueId: parts[6] || '',
  };
}

// Extract best available image URL from Meta creative object
function getBestImageUrl(creative: any): string | null {
  const spec = creative.object_story_spec;
  
  // 1. Check photo_data for full-res image (photo ads)
  if (spec?.photo_data?.url) {
    console.log("Using photo_data.url (full-res)");
    return spec.photo_data.url;
  }
  
  // 2. Check link_data for picture (link ads)
  if (spec?.link_data?.picture) {
    console.log("Using link_data.picture");
    return spec.link_data.picture;
  }
  
  // 3. Check link_data for image_hash and resolve via child_attachments
  if (spec?.link_data?.child_attachments?.length > 0) {
    const firstAttachment = spec.link_data.child_attachments[0];
    if (firstAttachment?.picture) {
      console.log("Using child_attachment picture");
      return firstAttachment.picture;
    }
  }
  
  // 4. Check video_data for video thumbnail (video ads)
  if (spec?.video_data?.image_url) {
    console.log("Using video_data.image_url");
    return spec.video_data.image_url;
  }
  
  // 5. Fallback to image_url if available
  if (creative.image_url) {
    console.log("Using fallback image_url");
    return creative.image_url;
  }
  
  // 6. Last resort: thumbnail_url (64x64 low-res)
  if (creative.thumbnail_url) {
    console.log("Using fallback thumbnail_url (low-res)");
    return creative.thumbnail_url;
  }
  
  return null;
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
    if (contentType.includes('mov')) return 'mov';
  }
  
  const urlPath = url.split('?')[0];
  const ext = urlPath.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  
  return 'jpg';
}

// Download asset and upload to Supabase Storage
async function downloadAndStoreAsset(
  supabase: any,
  originalUrl: string,
  platform: string,
  conceptId: string,
  uniqueId: string
): Promise<{ storedUrl: string; width?: number; height?: number } | null> {
  try {
    console.log(`Downloading asset: ${originalUrl.substring(0, 100)}...`);
    
    const response = await fetch(originalUrl);
    if (!response.ok) {
      console.error(`Failed to download: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    const ext = getExtension(originalUrl, contentType);
    const blob = await response.blob();
    
    // Create storage path: platform/concept_id/unique_id.ext
    const filename = sanitizeFilename(uniqueId || 'asset') + '.' + ext;
    const storagePath = `${platform}/${sanitizeFilename(conceptId || 'unknown')}/${filename}`;
    
    console.log(`Uploading to storage: ${storagePath}`);
    
    const { error: uploadError } = await supabase.storage
      .from('creative-assets')
      .upload(storagePath, blob, {
        contentType: contentType || 'image/jpeg',
        upsert: true,
      });
    
    if (uploadError) {
      console.error(`Upload error: ${uploadError.message}`);
      return null;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('creative-assets')
      .getPublicUrl(storagePath);
    
    console.log(`Stored at: ${publicUrl}`);
    return { storedUrl: publicUrl };
  } catch (error) {
    console.error(`Error storing asset: ${error}`);
    return null;
  }
}

// Fetch Meta ad creatives
async function fetchMetaCreatives(): Promise<Array<{
  creativeName: string;
  platformCreativeId: string;
  thumbnailUrl: string;
  assetType: string;
}>> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");
  
  if (!accessToken || !adAccountId) {
    console.log("Missing Meta credentials, skipping Meta creatives");
    return [];
  }
  
  if (!adAccountId.startsWith("act_")) {
    adAccountId = `act_${adAccountId}`;
  }
  
  const creatives: Array<{
    creativeName: string;
    platformCreativeId: string;
    thumbnailUrl: string;
    assetType: string;
  }> = [];
  
  try {
    // Fetch ads with their creatives
    const adsUrl = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/ads`);
    adsUrl.searchParams.set("fields", "id,name,creative{id,name,thumbnail_url,image_url,object_type,object_story_spec}");
    adsUrl.searchParams.set("limit", "500");
    adsUrl.searchParams.set("access_token", accessToken);
    
    console.log("Fetching Meta ads with creatives...");
    const response = await fetch(adsUrl.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Meta API error: ${errorText}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Found ${data.data?.length || 0} Meta ads`);
    
    for (const ad of data.data || []) {
      const creative = ad.creative;
      if (!creative) continue;
      
      // Extract best available image URL from object_story_spec
      const thumbnailUrl = getBestImageUrl(creative);
      if (!thumbnailUrl) continue;
      
      // Use ad name (which follows naming convention) as creative name
      const creativeName = ad.name || creative.name || '';
      
      // Determine asset type from object_type and object_story_spec
      let assetType = 'image';
      if (creative.object_type === 'VIDEO') {
        assetType = 'video';
      } else if (creative.object_story_spec?.video_data) {
        assetType = 'video';
      }
      
      creatives.push({
        creativeName,
        platformCreativeId: creative.id || ad.id,
        thumbnailUrl,
        assetType,
      });
    }
    
    console.log(`Extracted ${creatives.length} Meta creatives with thumbnails`);
  } catch (error) {
    console.error(`Error fetching Meta creatives: ${error}`);
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
    console.log("Missing Snapchat credentials, skipping Snapchat creatives");
    return [];
  }
  
  const creatives: Array<{
    creativeName: string;
    platformCreativeId: string;
    thumbnailUrl: string;
    assetType: string;
  }> = [];
  
  try {
    // Get access token
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
    
    // Fetch ads (which contain the ad name following naming convention)
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
    
    // Collect creative IDs and their corresponding ad names
    const adCreativeMap = new Map<string, string>();
    for (const wrapper of adsData.ads || []) {
      const ad = wrapper.ad;
      if (ad?.name && ad?.creative_id) {
        adCreativeMap.set(ad.creative_id, ad.name);
      }
    }
    
    // Fetch creatives for media info
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
    
    // Get media IDs
    const mediaIds: string[] = [];
    const creativeMediaMap = new Map<string, string>(); // media_id -> creative_id
    
    for (const wrapper of creativesData.creatives || []) {
      const creative = wrapper.creative;
      if (creative?.top_snap_media_id) {
        mediaIds.push(creative.top_snap_media_id);
        creativeMediaMap.set(creative.top_snap_media_id, creative.id);
      }
    }
    
    // Fetch media preview URLs in batches
    console.log(`Fetching ${mediaIds.length} Snapchat media items...`);
    for (const mediaId of mediaIds.slice(0, 50)) { // Limit to 50 for now
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
    
    console.log(`Extracted ${creatives.length} Snapchat creatives with thumbnails`);
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
    // Parse request body for platform filter
    let platforms = ['meta', 'snapchat']; // Default to all supported platforms
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
    
    console.log(`=== Fetching creative assets for platforms: ${platforms.join(', ')} ===`);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get existing assets to avoid re-downloading
    const { data: existingAssets } = await supabase
      .from('creative_assets')
      .select('platform, platform_creative_id');
    
    const existingSet = new Set(
      (existingAssets || []).map(a => `${a.platform}:${a.platform_creative_id}`)
    );
    console.log(`Found ${existingSet.size} existing assets in database`);
    
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      byPlatform: {} as Record<string, { processed: number; skipped: number; errors: number }>,
    };
    
    // Fetch creatives from each platform
    const allCreatives: Array<{
      platform: string;
      creativeName: string;
      platformCreativeId: string;
      thumbnailUrl: string;
      assetType: string;
    }> = [];
    
    if (platforms.includes('meta')) {
      const metaCreatives = await fetchMetaCreatives();
      for (const c of metaCreatives) {
        allCreatives.push({ platform: 'meta', ...c });
      }
      results.byPlatform.meta = { processed: 0, skipped: 0, errors: 0 };
    }
    
    if (platforms.includes('snapchat')) {
      const snapchatCreatives = await fetchSnapchatCreatives();
      for (const c of snapchatCreatives) {
        allCreatives.push({ platform: 'snapchat', ...c });
      }
      results.byPlatform.snapchat = { processed: 0, skipped: 0, errors: 0 };
    }
    
    console.log(`Total creatives to process: ${allCreatives.length}`);
    
    // Process each creative
    for (const creative of allCreatives) {
      const existingKey = `${creative.platform}:${creative.platformCreativeId}`;
      
      // Skip if already exists (unless force refresh)
      if (!forceRefresh && existingSet.has(existingKey)) {
        results.skipped++;
        if (results.byPlatform[creative.platform]) {
          results.byPlatform[creative.platform].skipped++;
        }
        continue;
      }
      
      // Parse naming convention
      const { conceptId, uniqueId } = parseCreativeName(creative.creativeName);
      
      // Download and store asset
      const stored = await downloadAndStoreAsset(
        supabase,
        creative.thumbnailUrl,
        creative.platform,
        conceptId,
        uniqueId || creative.platformCreativeId
      );
      
      if (!stored) {
        results.errors++;
        if (results.byPlatform[creative.platform]) {
          results.byPlatform[creative.platform].errors++;
        }
        continue;
      }
      
      // Upsert to creative_assets table
      const { error: upsertError } = await supabase
        .from('creative_assets')
        .upsert({
          creative_name: creative.creativeName,
          concept_id: conceptId || null,
          unique_identifier: uniqueId || null,
          platform: creative.platform,
          platform_creative_id: creative.platformCreativeId,
          asset_type: creative.assetType,
          thumbnail_url: stored.storedUrl,
          original_url: creative.thumbnailUrl,
          width: stored.width || null,
          height: stored.height || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'platform,platform_creative_id',
        });
      
      if (upsertError) {
        console.error(`Upsert error: ${upsertError.message}`);
        results.errors++;
        if (results.byPlatform[creative.platform]) {
          results.byPlatform[creative.platform].errors++;
        }
        continue;
      }
      
      results.processed++;
      if (results.byPlatform[creative.platform]) {
        results.byPlatform[creative.platform].processed++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`=== Completed in ${duration}ms: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors ===`);
    
    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Fetch creative assets error:", errorMessage);
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
