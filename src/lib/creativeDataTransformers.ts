/**
 * Layer 3: Client-side URL resolution utilities.
 * Implements the thumbnail URL priority waterfall and video detection.
 */

interface CreativeData {
  stored_url?: string | null;
  resolved_hd_url?: string | null;
  resolved_video_thumbnail?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  object_story_spec?: {
    link_data?: { image_url?: string; picture?: string };
    video_data?: { video_id?: string; image_url?: string };
    photo_data?: { url?: string };
  };
  asset_feed_spec?: {
    images?: Array<{ url?: string }>;
    videos?: Array<{ video_id?: string; thumbnail_url?: string }>;
  };
  video_source?: string;
}

/**
 * Extract the best available image URL using the priority waterfall.
 * Rejects URLs containing p64x64 (tiny Meta placeholders).
 */
export function extractImageUrl(creative: CreativeData): string | null {
  const candidates: (string | null | undefined)[] = [
    creative.stored_url,
    creative.resolved_hd_url,
    creative.resolved_video_thumbnail,
    creative.image_url,
    creative.object_story_spec?.link_data?.image_url,
    creative.object_story_spec?.link_data?.picture,
    creative.object_story_spec?.video_data?.image_url,
    creative.object_story_spec?.photo_data?.url,
    creative.asset_feed_spec?.images?.[0]?.url,
    creative.thumbnail_url,
  ];

  for (const url of candidates) {
    if (url && !url.includes("p64x64")) {
      return url;
    }
  }

  return null;
}

/**
 * Detect if a creative is a video based on its ad data.
 */
export function isVideoCreative(creative: CreativeData): boolean {
  if (creative.video_source) return true;
  if (creative.object_story_spec?.video_data?.video_id) return true;
  if (creative.asset_feed_spec?.videos && creative.asset_feed_spec.videos.length > 0) return true;
  return false;
}

/**
 * Extract video ID from creative data if available.
 */
export function extractVideoId(creative: CreativeData): string | null {
  return creative.object_story_spec?.video_data?.video_id || 
    creative.asset_feed_spec?.videos?.[0]?.video_id || 
    null;
}

/**
 * Extract image hash from creative data for HD resolution.
 */
export function extractImageHash(creative: CreativeData): string | null {
  const spec = creative.object_story_spec;
  return (spec?.link_data as any)?.image_hash ||
    (spec?.photo_data as any)?.image_hash ||
    (creative as any)?.image_hash ||
    null;
}
