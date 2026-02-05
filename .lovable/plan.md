# Enhance Creative Insights API with Stored Asset URLs

## Overview
Integrate the existing `creative_assets` storage system with the `creative-insights` API endpoint, so LLMs receive both performance data AND visual asset URLs for each creative.

---

## Status: ✅ Complete

All components are now fully integrated:

| Component | Status | Details |
|-----------|--------|---------|
| `creative_assets` table | ✅ Ready | 336+ Meta assets stored |
| `creative-assets` storage bucket | ✅ Ready | Files stored at permanent public URLs |
| `fetch-creative-assets` function | ✅ Built | Downloads from Meta/Snapchat APIs |
| `creative-insights` API | ✅ Enhanced | Returns performance data WITH asset URLs |
| Creative Cards UI | ✅ Enhanced | Displays thumbnails from stored assets |

---

## What Was Implemented

### 1. Update `creative-insights` API to Include Asset URLs

Added database lookup to match `ad_name` with stored assets. Response now includes:

```json
{
  "adName": "BrandPage | UGC | Video | CONCEPT001 | ...",
  "metrics": { ... },
  "parsed": { ... },
  "platformBreakdown": [ ... ],
  "assetUrl": "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/CONCEPT001/V1_HERO.jpg",
  "assetType": "image"
}
```

### 2. Add Optional Asset Sync Trigger

The API supports `syncAssets: true` in request body to trigger fresh asset sync before returning data.
- `syncAssets: true` in request body
- Calls `fetch-creative-assets` first, then returns enriched data
- Default: `false` (fast mode, uses cached assets)

### 3. Summary Statistics for Assets

Response metadata includes asset coverage stats:
```json
{
  "meta": {
    "totalCreatives": 47,
    "creativesWithAssets": 38,
    "assetCoverage": 0.81
  }
}
```

### 4. Creative Cards UI with Thumbnails

The reporting page creative cards now display:
- Large 4:3 aspect ratio thumbnail images
- Video/Image badge overlay on the image
- Structured layout matching the reference design
- Graceful fallback to icon when no asset is available

---

## Data Flow

```text
+------------------+     +------------------------+
|  LLM / Agent     | --> |  creative-insights     |
+------------------+     +------------------------+
                                   |
         +-----------+-------------+-------------+
         |           |             |             |
         v           v             v             v
    +--------+  +--------+  +------------+  +------------+
    | Meta   |  | Snap   |  | creative_  |  | Storage    |
    | BQ     |  | BQ     |  | assets DB  |  | Bucket     |
    +--------+  +--------+  +------------+  +------------+
                                  |               |
                                  +-------+-------+
                                          |
                                          v
                                  +----------------+
                                  | Enriched       |
                                  | Response with  |
                                  | Asset URLs     |
                                  +----------------+
```

---

## Triggering Asset Sync (For Initial Population)

You can manually sync all Meta creatives with this call:

```bash
curl -X POST https://agususzieosizftucxxq.supabase.co/functions/v1/fetch-creative-assets \
  -H "Content-Type: application/json" \
  -d '{"platforms": ["meta"], "forceRefresh": false}'
```

This downloads all Meta ad thumbnails and stores them permanently.

---

## Why Meta is the Best Source

1. **Already working**: 336 assets stored and ready
2. **Stable URLs**: Meta provides permanent `thumbnail_url` values
3. **Direct API**: No OAuth dance like Snapchat's 3-step media fetch
4. **Naming match**: Uses exact `ad_name` that matches your convention
5. **Coverage**: Meta likely has the most spend, so highest value assets

---

## Next Steps

- **Snapchat assets**: The function already supports Snapchat, but it's limited to 50 media items and URLs are ephemeral - could enhance this later
- **Schedule sync**: Set up a daily cron job to sync new creatives automatically
- **Asset type filtering**: Allow LLMs to request "only video creatives" or "only image creatives"

