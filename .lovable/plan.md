

# Enhance Creative Insights API with Stored Asset URLs

## Overview
Integrate the existing `creative_assets` storage system with the `creative-insights` API endpoint, so LLMs receive both performance data AND visual asset URLs for each creative.

---

## What Already Exists

| Component | Status | Details |
|-----------|--------|---------|
| `creative_assets` table | ✅ Ready | 336 Meta assets already stored |
| `creative-assets` storage bucket | ✅ Ready | Files stored at permanent public URLs |
| `fetch-creative-assets` function | ✅ Built | Downloads from Meta/Snapchat APIs |
| `creative-insights` API | ✅ Built | Returns performance data (no assets yet) |

---

## What Gets Enhanced

### 1. Update `creative-insights` API to Include Asset URLs

Add a database lookup to match `ad_name` with stored assets and include the `thumbnail_url` in the response.

**New response field per creative:**
```json
{
  "adName": "BrandPage | UGC | Video | CONCEPT001 | ...",
  "metrics": { ... },
  "parsed": { ... },
  "platformBreakdown": [ ... ],
  "assetUrl": "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/CONCEPT001/V1_HERO.jpg",
  "assetType": "video"
}
```

### 2. Add Optional Asset Sync Trigger

Allow the `creative-insights` API to optionally trigger a fresh asset sync before returning data:
- `syncAssets: true` in request body
- Calls `fetch-creative-assets` first, then returns enriched data
- Default: `false` (fast mode, uses cached assets)

### 3. Summary Statistics for Assets

Include asset coverage in the response metadata:
```json
{
  "meta": {
    "totalCreatives": 47,
    "creativesWithAssets": 38,
    "assetCoverage": 0.81
  }
}
```

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

## Technical Implementation

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/creative-insights/index.ts` | Add Supabase client, query `creative_assets` table, join asset URLs to response |

### Key Code Addition

```typescript
// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

// Fetch all stored assets for matching
const { data: assets } = await supabase
  .from('creative_assets')
  .select('creative_name, thumbnail_url, asset_type');

const assetMap = new Map(
  (assets || []).map(a => [a.creative_name, { url: a.thumbnail_url, type: a.asset_type }])
);

// When building response, add asset info:
for (const creative of blendedCreatives) {
  const asset = assetMap.get(creative.adName);
  creative.assetUrl = asset?.url || null;
  creative.assetType = asset?.type || null;
}
```

---

## Why Meta is the Best Source

1. **Already working**: 336 assets stored and ready
2. **Stable URLs**: Meta provides permanent `thumbnail_url` values
3. **Direct API**: No OAuth dance like Snapchat's 3-step media fetch
4. **Naming match**: Uses exact `ad_name` that matches your convention
5. **Coverage**: Meta likely has the most spend, so highest value assets

---

## Next Steps After This

- **Snapchat assets**: The function already supports Snapchat, but it's limited to 50 media items and URLs are ephemeral - could enhance this later
- **Schedule sync**: Set up a daily cron job to sync new creatives automatically
- **Asset type filtering**: Allow LLMs to request "only video creatives" or "only image creatives"

