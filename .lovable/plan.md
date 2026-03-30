

## Problem

The thumbnails showing up in the grid are not 1080x1080. The issue is in how the edge function resolves and downloads images:

1. **`adimages` endpoint returns full-res URLs** -- this is the best source and does return large images. But many SHARE creatives have no `image_hash`, so this path is skipped entirely.

2. **Fallback URLs from `object_story_spec` are CDN-served** -- Meta returns URLs like `https://scontent.fbcdn.net/...` which are often pre-sized by Meta (e.g., 600x600, 400x400). The current `getHighResFacebookUrlCandidates` tries path manipulation but this only works for the `/p64x64/` pattern, not for general CDN sizing.

3. **No size validation on download** -- the function downloads whatever it gets without checking actual dimensions, so a 400px image gets stored and served as-is.

## Plan

### 1. Request higher-res images from the Meta API directly
- When fetching creative details, add `fields=...,effective_object_story_id` to the batch request
- For SHARE creatives without an `image_hash`, use the `effective_object_story_id` to fetch the post's full attachments via `/{post_id}?fields=full_picture` -- Meta's `full_picture` field returns the largest available rendition (typically 1080+px)

### 2. Add `full_picture` as the top-priority fallback for SHARE creatives
- In `resolveBestImageUrl`, insert `detail.full_picture` right after `resolvedImageUrl` (adimages hash) and before `link_data.image_url`
- This ensures SHARE creatives get the highest resolution available

### 3. Log actual downloaded dimensions for debugging
- After downloading an image blob, use the `Content-Length` header and log the resolved URL + size so we can verify dimensions in future runs
- Add dimension logging: `console.log(\`Downloaded ${url}: ${blob.size} bytes\`)`

### 4. Strip CDN resize parameters more aggressively
- Expand `getHighResFacebookUrlCandidates` to also strip the `stp` query parameter (Meta uses this for server-side transforms like `stp=dst-jpg_s600x600`) and common path-based resize tokens like `/s600x600/`

### Technical Details

**File: `supabase/functions/fetch-missing-thumbnails/index.ts`**

- Add `effective_object_story_id` to the creative details batch fetch fields (line 220)
- After the `adimages` hash resolution block, add a new block that iterates SHARE creatives missing a `resolvedImageUrl` and fetches `/{effective_object_story_id}?fields=full_picture` in batches
- Update `resolveBestImageUrl` to check `detail.full_picture` as priority #2
- Update `getHighResFacebookUrlCandidates` to strip the `stp` parameter (which controls server-side resizing)
- Add byte-size logging in `downloadAndStore`

