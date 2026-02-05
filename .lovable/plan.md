

# Download Full-Resolution Creative Assets

## Problem
The creative thumbnails are blurry because Meta's API returns 64x64 pixel preview URLs (containing `p64x64` in the URL string). All 336 currently stored assets came from these low-res previews. The previous attempt to use `object_story_spec` didn't help because Meta's CDN transforms all URLs to 64x64 by default.

## Solution
Fetch the **actual creative asset** files directly from Meta's Creative API instead of the ad-level thumbnail URLs. For video ads, we'll download the source video file and generate a custom 640px thumbnail.

---

## Technical Approach

### 1. Use Meta's Creatives Endpoint Directly

Instead of fetching via the ads endpoint, query the creatives endpoint which provides direct access to source files:

```text
GET /v19.0/{ad-account-id}/adcreatives
Fields: id,name,effective_object_story_id,source_instagram_media_id,
        object_story_spec,image_url,video_id
```

For **images**: The `image_url` field returns the full-resolution source image (not CDN-transformed).

For **videos**: Use the `video_id` to fetch the video source via:
```text
GET /v19.0/{video_id}?fields=source,picture
```
- `source` = Full MP4 file URL
- `picture` = Video poster image (usually 720p+)

### 2. Download and Store Full Assets

| Asset Type | What to Download | Storage Path |
|------------|------------------|--------------|
| Image | Full source image | `creative-assets/meta/{conceptId}/{uniqueId}.{ext}` |
| Video | MP4 source + poster | `creative-assets/meta/{conceptId}/{uniqueId}.mp4` + `..._poster.jpg` |

### 3. Generate Optimized Thumbnails (640px wide)

After downloading the full asset:
- For images: The original is stored as-is (Meta images are typically web-optimized already)
- For videos: Store both the MP4 and the poster image

The UI cards will use the poster for videos and the full image for images. These will be much sharper than 64x64.

### 4. Update Database Schema

Add new columns to track full asset URLs:

| Column | Type | Purpose |
|--------|------|---------|
| `full_asset_url` | text | URL to stored full image or video |
| `poster_url` | text | URL to video poster (videos only) |
| `source_resolution` | text | Original resolution e.g. "1080x1920" |

---

## File Changes

| File | Change |
|------|--------|
| `supabase/functions/fetch-creative-assets/index.ts` | Complete rewrite of Meta fetching logic to use creatives endpoint, download source files, handle videos |
| Database migration | Add `full_asset_url`, `poster_url`, `source_resolution` columns |
| `src/hooks/useMultiPlatformCreatives.ts` | Update to prefer `full_asset_url` over `thumbnail_url` |
| `src/components/reporting/CreativePerformanceGrid.tsx` | Display video poster for video assets |
| `src/components/reporting/CreativePreviewDialog.tsx` | Add video playback support for video assets |

---

## Data Flow

```text
Meta Creatives API
       │
       ├── Image Ads ─────► Fetch image_url (full-res)
       │                         │
       │                         ▼
       │                    Download & Store
       │                    creative-assets/meta/{concept}/{id}.jpg
       │
       └── Video Ads ─────► Fetch video_id
                                 │
                                 ▼
                           Fetch /v19.0/{video_id}?fields=source,picture
                                 │
                                 ├── source → Store MP4
                                 └── picture → Store poster.jpg
```

---

## Why This Works

1. **Source files not CDN-transformed**: Meta's `image_url` and video `source` fields return the original uploaded files, not the 64x64 CDN previews
2. **Video playback**: By storing the actual MP4, you can play videos in the preview dialog
3. **Sharp thumbnails**: Video `picture` field returns a poster image typically at 720p+ resolution
4. **Future-proof**: Full assets enable future features like video analysis, A/B comparisons, etc.

---

## Migration Strategy

1. Deploy the updated function
2. Run sync with `forceRefresh: true` to re-download all assets at full resolution
3. Existing 336 records will be updated with new high-res URLs
4. UI will immediately show sharp images once sync completes

---

## Video Playback in Preview Dialog

The CreativePreviewDialog will be enhanced to:
- Detect if asset is video (by checking `asset_type` or file extension)
- Show a video player with play button overlay
- Fall back to poster image if video fails to load

