

# Fix: Only 1/126 Ads Has High-Res Image — Root Cause and Solution

## What's Actually Happening

The logs prove it:
```
Found 1 image hashes out of 126 ads
1/126 ads now have high-res image URLs
```

The current approach queries `/?ids={ad_ids}&fields=creative{image_hash}`. But **125 out of 126 ads are dark posts or link ads** — their images are stored inside `object_story_spec` (as `link_data.picture` or `photo_data.url`), NOT as a top-level `image_hash`. Only 1 ad has a direct `image_hash`, which is why only that one works.

## Solution: Fetch Creative Image URLs via `object_story_spec` in Small Batches

Instead of relying solely on `image_hash`, we need to query each ad's creative for the actual image source from `object_story_spec`. The key is doing this in **very small batches** (10-15 at a time) to avoid the "reduce data" error that killed previous attempts.

### Changes to `meta-hours-creatives/index.ts`

Rewrite `resolveHighResImages` to:

1. **Batch-query ad IDs** (batches of 10) with fields: `creative{id,image_hash,image_url,object_story_spec{link_data{picture,image_hash},photo_data{url,image_hash}}}`
2. **Extract image URL** using this priority:
   - `object_story_spec.link_data.picture` (most common for dark posts — returns full-res)
   - `object_story_spec.photo_data.url` (full-res photo post URL)
   - If only `image_hash` found (from any level), batch-resolve via `/adimages` API as before
   - `creative.image_url` as last resort (may still be low-res but better than nothing)
3. **For any remaining hashes**, do the existing `/adimages?hashes=[...]` batch resolution

The small batch size (10) is critical — previous attempts with 500 and even 100 caused Meta API errors. With 126 ads, that's only 13 API calls.

### Files to edit
- **`supabase/functions/meta-hours-creatives/index.ts`** — Rewrite `resolveHighResImages` to extract URLs from `object_story_spec` in small batches, falling back to `image_hash` → `/adimages` resolution

No frontend changes needed — the hook already maps `ad.image_url` to `assetUrl`.

