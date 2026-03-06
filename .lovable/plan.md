
# Fix Blurry Images — Use Meta Ad Images API for Full Resolution

## Status: IMPLEMENTED

## What was done

1. **Updated `fetch-creative-assets` edge function** to:
   - Request `image_hash` field from `/adcreatives` endpoint
   - Batch-query Meta's Ad Images API (`/act_{id}/adimages?hashes=[...]`) in groups of 50
   - Use the full-resolution `url` from the Ad Images API as the source for downloading/storing
   - This replaces the old 64x64 `image_url` fallback with actual full-res source images

2. **Added "Refresh Assets" button** to the Hours Creatives page
   - Triggers `fetch-creative-assets` with `forceRefresh: true` and `platforms: ['meta']`
   - Shows progress toasts and re-fetches data after completion

## How to use
Click "Refresh Assets" on the Hours Creatives page to re-sync all Meta image creatives with high-resolution source URLs from the Ad Images API.
