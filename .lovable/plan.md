

# Fix Blurry Images — Use Original Meta URLs

## Problem
The Supabase Storage thumbnails are low-res (640px WebP). The full-resolution source images live in the `creative_assets.original_url` column, which stores the original Meta CDN URL. This field is currently unused by the Hours Creatives page.

## Approach
Instead of trying to make stored thumbnails look sharp, use the **`original_url`** field from `creative_assets` as the primary display and download source. This is the original high-res URL from Meta's CDN. For cards where no `original_url` exists, fall back to the stored thumbnail. For download, link directly to the original URL (opening in a new tab if blob download fails due to CORS).

### Changes

**`src/hooks/useHoursCreatives.ts`**
- Add `original_url` to the `creative_assets` select query
- Store it in the asset map and expose it on `HoursCreative` as `originalUrl`
- Set `assetUrl` priority: `original_url` > `full_asset_url` > `thumbnail_url` > API `image_url`

**`src/pages/HoursCreatives.tsx`**
- Use `originalUrl` for card image display
- Update download to prefer `originalUrl`; if blob fetch fails (CORS), open the URL in a new tab instead

**`src/lib/downloadAsset.ts`**
- Update `getDownloadUrl` to check `originalUrl` first
- Add CORS fallback: if `fetch()` fails, `window.open(url, '_blank')` so the user can right-click save or the browser handles it

**`src/components/reporting/CreativePreviewDialog.tsx`**
- Use `originalUrl` when available for the preview image and download button

### Why This Works
The `original_url` column already contains the full-resolution Meta CDN link (e.g. `scontent.xx.fbcdn.net` URLs). These are the source images Meta serves — no compression, no 640px resize. Even if CORS blocks a programmatic download, opening the link lets users save the full-res file directly.

