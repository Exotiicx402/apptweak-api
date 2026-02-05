
## What I’m seeing (why it’s still blurry + why videos don’t play)

### 1) Most rows still don’t have a “full asset”
From the database right now:
- Meta creatives total: **352**
- With `full_asset_url`: **96**
- Videos with posters: **42**
- Videos with actual MP4 (`full_asset_url` for video): effectively **0** (edge logs show **Videos: 0**)

So the UI is still showing:
- **Old low-res images** (because many rows never got upgraded)
- **Video posters only** (so clicking can’t play, because `CreativePreviewDialog` only plays if `fullAssetUrl` exists)

### 2) The Meta fetch is still built around the **/ads** endpoint
The current backend function (`fetch-creative-assets`) still fetches creatives via:
- `GET /{adAccountId}/ads?fields=...creative{...}`

This is a big reason you’re not getting true source media reliably, and why many creatives never get updated.

### 3) Caching can also make “re-downloaded” assets look unchanged
Uploads are currently done with:
- `cacheControl: '31536000'` (1 year)

Even if we overwrite the same storage path, browsers/CDNs can keep serving the old object unless we:
- change the filename/path, or
- add a cache-busting query string in the UI, or
- use a much shorter cache policy (and still ideally cache-bust)

## Do we need to repopulate?
Yes — but repopulating only helps after we fix the backend to actually:
1) fetch true full-resolution media, and  
2) store a proper video MP4 URL, and  
3) generate/store our own 640px thumbnails, and  
4) ensure the UI bypasses old cached objects.

Once that’s done, we run the sync with `forceRefresh: true` to rebuild everything.

---

## Implementation plan (fix quality + playability end-to-end)

### A) Backend: change Meta ingestion to fetch true source assets
Update `supabase/functions/fetch-creative-assets/index.ts`:

1) **Switch Meta fetching to the creatives endpoint (with pagination)**
Use:
- `GET /v19.0/{adAccountId}/adcreatives?fields=id,name,object_type,image_url,video_id,object_story_spec,...&limit=500`
Then follow `paging.next` until complete.

This will cover creatives beyond the first 500 ads, and avoids relying on ad-level thumbnail behavior.

2) **Videos: download the real MP4**
For each creative with `video_id`:
- `GET /v19.0/{video_id}?fields=source,picture`
- Download `source` (MP4) and upload to storage
- Download `picture` (poster) and upload to storage

Write to DB:
- `full_asset_url` = stored MP4 public URL
- `poster_url` = stored poster public URL
- `thumbnail_url` = generated 640px thumbnail (see below)

3) **Images: download full res, then generate our own 640px thumbnail**
For each creative with `image_url` (or best available high-res URL from story spec):
- Download full image → upload as “full”
- Generate 640px-wide thumbnail (WebP recommended) → upload as “thumb”

Write to DB:
- `full_asset_url` = stored original full-res URL
- `thumbnail_url` = stored 640px thumb URL

4) **Generate thumbnails (640px wide) in the backend**
Add ImageScript to the backend function:
- `import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";`
Flow:
- decode downloaded image/poster
- resize to width 640 (keep aspect ratio)
- encode to WebP (or JPG if WebP fails)
- upload thumb

Note: For videos, we thumbnail the **poster** image (not the MP4) to avoid requiring ffmpeg.

5) **Fix caching so updates show immediately**
Do both (belt + suspenders):
- Change upload `cacheControl` from `31536000` to something safer for assets that may be overwritten (e.g. `3600`)
- Also store and use `updated_at` for cache-busting on the frontend (see section B)

6) **Improve logging + result summary**
Add explicit logs for:
- video source fetch success/failure
- when a creative is video but missing `videoSourceUrl`
Return counts like:
- `videos_with_source`, `videos_missing_source`, `thumbs_generated`, etc.

### B) Frontend: always use generated thumbnail for grid; full asset for preview
Update `src/hooks/useMultiPlatformCreatives.ts`:

1) Fetch `updated_at` too:
- `select('creative_name, thumbnail_url, asset_type, full_asset_url, poster_url, updated_at')`

2) Build URLs like:
- `thumbUrl = thumbnail_url ? thumbnail_url + '?v=' + updated_at : null`
- `fullUrl = full_asset_url ? full_asset_url + '?v=' + updated_at : null`
- `posterUrl = poster_url ? poster_url + '?v=' + updated_at : null`

3) Change mapping logic so card images never accidentally point at an MP4:
- `assetUrl` should always be the **thumbnail_url** (the generated 640px image)
- `fullAssetUrl` is used only for the preview modal (and video playback)
- `posterUrl` used for video poster display

Update `src/components/reporting/CreativePerformanceGrid.tsx`:
- keep `<img src={creative.assetUrl}>` (now always a thumbnail image)

Update `src/components/reporting/CreativePreviewDialog.tsx`:
- Video: `videoUrl = creative.fullAssetUrl` (MP4)
- Poster: prefer `creative.posterUrl` (high-res poster), fall back to `creative.assetUrl` (thumb)

### C) Add a simple “Repopulate assets” control in the UI
Right now, there’s no obvious place in `/reporting` to kick off `fetch-creative-assets` with `forceRefresh`.

Add a button (likely on `/controls`) that calls:
- `supabase.functions.invoke('fetch-creative-assets', { body: { platforms: ['meta'], forceRefresh: true } })`

Also:
- show progress/toast
- invalidate the creative asset queries afterward so thumbnails refresh immediately

### D) Repopulate (after code ships)
Once the above is implemented:
1) Click “Repopulate Meta assets (force refresh)”
2) Wait for completion
3) Verify:
   - DB `full_asset_url` count increases substantially
   - edge logs show `Videos: > 0`
   - reporting grid thumbnails are crisp
   - video plays in the modal

---

## Acceptance criteria (how we’ll know it’s fixed)
- Grid thumbnails are sharp (generated 640px thumbs, not platform previews)
- Clicking a video creative shows a playable MP4 in the modal
- Re-syncing updates assets without “stuck” caching (cache-busted URLs)

---

## Files involved
Backend:
- `supabase/functions/fetch-creative-assets/index.ts` (rewrite Meta portion + add thumbnail generation + caching changes)

Frontend:
- `src/hooks/useMultiPlatformCreatives.ts` (use thumb vs full, add cache busting, fetch `updated_at`)
- `src/components/reporting/CreativePreviewDialog.tsx` (ensure video uses MP4 URL; poster uses poster_url)
- `src/pages/Controls.tsx` (add “Repopulate assets” button using existing invoke pattern)

---

## Notes / constraints
- We will not store any binary data in the database (only storage URLs + metadata).
- Thumbnail generation will be done server-side using ImageScript to ensure consistent quality and sizing.
