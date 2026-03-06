

# Fix Blurry Images — Root Cause Found, New Approach

## The Real Problem

Two compounding issues:

1. **The `fetch-creative-assets` function crashes** before processing any creatives. The logs show:
   ```
   Meta creatives API error: {"error":{"code":1,"message":"Please reduce the amount of data you're asking for, then retry your request"}}
   Total Meta creatives extracted: 0
   ```
   It requests `object_story_spec` at `limit=500`, which Meta rejects. So **zero creatives get processed** — no high-res images are ever downloaded.

2. **The `original_url` stored in the DB is the 64x64 thumbnail** (note `stp=...p64x64...` in the URLs). The hook prioritizes `originalUrl`, which is itself blurry.

3. **`full_asset_url` is NULL** for most records because the function never successfully re-ran after the initial broken sync.

## Solution

### 1. Fix the edge function so it actually works (`fetch-creative-assets/index.ts`)

- **Remove `object_story_spec`** from the `/adcreatives` request fields. Only request lightweight fields: `id,name,object_type,image_url,image_hash,video_id`. This avoids the "reduce data" error.
- **Reduce limit from 500 to 100** as extra safety margin.
- The Ad Images API hash resolution (already coded) will then actually execute and return full-res URLs.
- Those full-res URLs get downloaded to Supabase Storage and stored as `full_asset_url` and `thumbnail_url`.

### 2. Update the hook to prefer Supabase Storage URLs (`useHoursCreatives.ts`)

- Priority: `dbFullAsset` (Supabase Storage) > `dbThumbnail` (Supabase Storage) > `apiImageUrl` (Meta API fallback)
- Remove `originalUrl` from priority since it currently contains 64x64 URLs. Keep it only for "open original" links.

### Files to edit
- **`supabase/functions/fetch-creative-assets/index.ts`** — Remove `object_story_spec` from fields, reduce limit to 100
- **`src/hooks/useHoursCreatives.ts`** — Fix asset URL priority to prefer Storage URLs over `original_url`

### After implementation
User clicks "Refresh Assets" → function actually processes all creatives → downloads full-res images via Ad Images API → stores in Supabase Storage → page displays crisp images from Storage.

