

# Add Download Functionality to Hours Creatives Page

## Problem
The team needs to download image assets from the Hours Creatives page to iterate on top-performing creatives. Currently the page shows thumbnails and metrics but has no download capability.

## Approach

Since this page is images-only, we need the full-resolution image URL for each ad. The current flow already joins with the `creative_assets` table which stores `full_asset_url` — but many ads may not have entries there. We need to ensure reliable download URLs.

Two changes:

### 1. Add download button to each card and the preview dialog
- Add a `Download` icon button on each card (bottom-right corner of the thumbnail area) that triggers a download of the full-resolution asset
- Add a "Download" button in the `CreativePreviewDialog` when opened from this page
- Use `fullAssetUrl` from creative_assets when available; fall back to `assetUrl` (thumbnail)
- Downloads will use `fetch()` + blob approach to force browser download (avoiding navigation to external URLs)

### 2. Add "Download All" bulk action
- Add a "Download All" button in the header/filter bar area
- Downloads all visible (filtered) creatives sequentially as individual files
- Uses the creative's unique identifier or ad name as the filename

### File Changes

- **`src/pages/HoursCreatives.tsx`** — Add per-card download button (icon overlay), bulk "Download All" button in header, download helper function
- **`src/components/reporting/CreativePreviewDialog.tsx`** — Add a download button next to the asset type badge or in the metadata section (only when asset URL is available)

### Technical Details
- Download helper: `fetch(url) → blob → createObjectURL → click hidden anchor → revoke`
- Stop event propagation on card download button so it doesn't open the preview dialog
- File naming: use `parsed.uniqueIdentifier` or fall back to `adId`

