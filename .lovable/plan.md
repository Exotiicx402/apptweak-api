

# Fix Blurry/Missing Images on Hours Creatives Page

## Root Cause

The hook (`useHoursCreatives.ts`) currently prioritizes the Meta API's `image_url` over the database's stored assets:
```typescript
assetUrl: apiImageUrl || dbThumbnail,  // API first = blurry 64x64 thumbnails
```

The `creative_assets` table already contains **high-resolution images stored in Supabase Storage**, downloaded by the existing `fetch-creative-assets` function. These are the same assets used successfully on the main Reporting page. The edge function's attempts to resolve images via `effective_object_story_id` and CDN URL upscaling are unreliable — most ads are dark posts without page posts, and the CDN hack doesn't always work.

## Plan

### 1. Simplify the edge function — remove image resolution logic
Strip out `getCreativeDetails`, `getPostImages`, and `upscaleMetaCdnUrl` from `meta-hours-creatives/index.ts`. The function should only return **metrics** (spend, installs, CTR, CPI). Images will come from the `creative_assets` DB table, which is already populated.

### 2. Flip image priority in the hook
In `useHoursCreatives.ts`, change the priority so **DB assets come first** (high-res Supabase Storage URLs), with API image as fallback:
```typescript
assetUrl: dbThumbnail || apiImageUrl,  // DB first = high-res stored images
fullAssetUrl: dbFullAsset || apiImageUrl,
```

### Files Changed
- **`supabase/functions/meta-hours-creatives/index.ts`** — Remove image resolution functions (~100 lines), simplify to metrics-only
- **`src/hooks/useHoursCreatives.ts`** — Flip asset URL priority to prefer DB over API

