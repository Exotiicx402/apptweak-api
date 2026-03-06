

# Fix Blurry Images — Use Meta Ad Images API for Full Resolution

## Root Cause (confirmed via database inspection)

The `creative_assets` table has **131 rows** for Hours/IMAGE creatives but only **7 have `full_asset_url`** populated. The rest have:
- `thumbnail_url` → downloaded from Meta's `image_url` field, which is a **64x64 pixel thumbnail** (the `stp=...p64x64...` parameter in the URL)
- `original_url` → the raw Meta CDN link, also 64x64
- `full_asset_url` → NULL for 124 of 131 rows

The `fetch-creative-assets` function tries to get high-res URLs from `object_story_spec` fields (`photo_data.url`, `link_data.picture`), but these are empty for dark-post creatives — which most "hours" ads are. So it falls back to `creative.image_url`, the 64x64 thumbnail.

## Solution: Use Meta's Ad Images API (`image_hash` → full-res URL)

Meta's `/adcreatives` endpoint exposes an `image_hash` field for every image creative. Using that hash, we can query the **Ad Images API** (`/act_{id}/adimages?hashes=[...]`) which returns the **full-resolution source URL** — no CDN resize, no 64x64 limit.

### Changes

**1. Update `fetch-creative-assets` edge function**
- Request the `image_hash` field from `/adcreatives` (add to the `fields` parameter)
- After collecting all creatives, batch-query `/adimages?hashes=hash1,hash2,...` (groups of 50) to get full-res `url` values
- Use the full-res `url` as the source for downloading and storing in Supabase Storage
- Update `original_url` in the DB to store the full-res URL instead of the 64x64 thumbnail
- This fixes both the stored thumbnails AND the original URLs going forward

**2. Update `useHoursCreatives.ts` hook**
- Keep current priority: `originalUrl` > `dbThumbnail` > `apiImageUrl`
- Once the asset refresh runs, `original_url` will contain the full-res URL, so images will display correctly

**3. Add a "Refresh Assets" button on the Hours Creatives page**
- Trigger the `fetch-creative-assets` function with `forceRefresh: true` and `platforms: ['meta']`
- Show progress toast so the user knows when it's done
- After refresh, re-fetch data to display updated high-res images

### Why this will work
The Ad Images API is Meta's canonical way to retrieve the original uploaded image at full resolution. Unlike `image_url` (which is a CDN thumbnail) or `object_story_spec` (which is empty for dark posts), `image_hash` + `/adimages` is always available and always returns the full source file.

### Files to edit
- `supabase/functions/fetch-creative-assets/index.ts` — add `image_hash` fetching and Ad Images API batch resolution
- `src/pages/HoursCreatives.tsx` — add "Refresh Assets" button

