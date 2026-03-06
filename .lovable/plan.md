

# Fix Blurry Images — Bypass Broken Asset Sync, Use Working Function

## Problem Summary
The `fetch-creative-assets` function consistently returns 0 creatives (confirmed in logs: "Total Meta creatives extracted: 0", "Processed: 0"). Despite multiple fix attempts, the `/ads` + `/adcreatives` pipeline in that function keeps failing. Meanwhile, `meta-hours-creatives` works perfectly and returns 126 ads every time.

## New Approach: Fetch High-Res URLs Directly in `meta-hours-creatives`

Instead of fixing the broken sync function, embed image resolution directly into the working `meta-hours-creatives` edge function. This function already successfully queries the Meta Insights API and returns ad performance data. We add two extra steps:

1. **Batch-query each ad's creative hash**: After getting insights (which returns `ad_id`), query `/?ids=ad_id1,ad_id2,...&fields=creative{image_hash}` in batches of 50 to get the `image_hash` for each ad.

2. **Resolve hashes to full-res URLs via Ad Images API**: Query `/act_{id}/adimages?hashes=[hash1,hash2,...]` to get the original uploaded image URL for each hash. These are full-resolution, not the 64x64 thumbnails.

3. **Return `image_url` in the response**: Each ad object in the response will include the full-res `image_url`. The frontend displays it directly from Meta's CDN -- no Supabase Storage needed.

### Files to edit

**`supabase/functions/meta-hours-creatives/index.ts`**
- After collecting all ads from insights, extract unique `ad_id`s
- Batch-query `/?ids=...&fields=id,creative{image_hash}` (groups of 50)
- Collect unique `image_hash` values
- Batch-query `/act_{id}/adimages?hashes=[...]` (groups of 50) to get full-res `url`
- Map full-res URLs back to ads via ad_id → hash → url
- Include `image_url` in each ad's response object

**`src/hooks/useHoursCreatives.ts`**
- Simplify: prioritize `ad.image_url` (now full-res from the edge function) as the primary display URL
- Remove dependency on `creative_assets` table for display (keep it as fallback only)
- Remove the "Refresh Assets" button dependency since images come directly from the API response

**`src/pages/HoursCreatives.tsx`**
- Remove the "Refresh Assets" button (no longer needed since images come from the API directly)
- Keep download button — use the full-res Meta CDN URL with CORS fallback (open in new tab)

### Why This Will Work
- `meta-hours-creatives` already works reliably (126 ads, every time)
- The Meta Insights API returns `ad_id`, which we can use to look up creative hashes
- The Ad Images API is the canonical way to get full-res source images
- No dependency on the broken `fetch-creative-assets` function
- Images served directly from Meta CDN -- no intermediate storage step that can fail

