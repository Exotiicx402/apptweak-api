

# Fix Blurry Thumbnails & Add Creative Preview

## Problem Analysis

### Why Thumbnails are Blurry
The current `fetch-creative-assets` function downloads Meta's `thumbnail_url`, which is a **64x64 pixel** preview image. This is visible in the stored URLs which contain `p64x64_q75` parameters.

### Why There's No Preview
The creative cards have no click handler for viewing the full creative. In "Blended" mode, clicking opens the platform breakdown dialog, not an image viewer.

---

## Solution

### Part 1: Fetch High-Resolution Images from Meta

Update the `fetch-creative-assets` function to request the `object_story_spec` field from the Meta API, which contains the full-resolution image URLs:

```text
API Request Changes:
- Current: "creative{id,name,thumbnail_url,image_url,object_type}"
- New:     "creative{id,name,thumbnail_url,image_url,object_type,object_story_spec}"
```

The `object_story_spec` contains:
- `photo_data.url` - Full-resolution image for photo ads
- `link_data.image_hash` - Can be resolved to full URL via the ad images endpoint
- `video_data.image_url` - Video thumbnail in higher resolution

Priority for image source:
1. `object_story_spec.photo_data.url` (full-res photo)
2. `object_story_spec.link_data.picture` (link preview image)
3. `creative.image_url` (fallback)
4. `creative.thumbnail_url` (last resort)

### Part 2: Add Creative Preview Dialog

Create a new dialog component that opens when clicking a creative card to show:
- Full-size thumbnail/image (or video player for video assets)
- Creative name and metadata
- Performance metrics summary
- Button to open platform breakdown (if blended)

---

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/fetch-creative-assets/index.ts` | Update Meta API request to include `object_story_spec`, extract high-res URLs |
| `src/components/reporting/CreativePerformanceGrid.tsx` | Add preview click handler and dialog |
| `src/components/reporting/CreativePreviewDialog.tsx` | New component for full-size preview |

### Meta API Changes

```typescript
// Update the fields requested from Meta
const adsUrl = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/ads`);
adsUrl.searchParams.set("fields", 
  "id,name,creative{id,name,thumbnail_url,image_url,object_type,object_story_spec}"
);

// Extract best available image URL
function getBestImageUrl(creative: any): string | null {
  // 1. Check photo_data for full-res image
  const photoUrl = creative.object_story_spec?.photo_data?.url;
  if (photoUrl) return photoUrl;
  
  // 2. Check link_data for picture
  const linkPicture = creative.object_story_spec?.link_data?.picture;
  if (linkPicture) return linkPicture;
  
  // 3. Check video_data for video thumbnail
  const videoThumb = creative.object_story_spec?.video_data?.image_url;
  if (videoThumb) return videoThumb;
  
  // 4. Fallback to image_url
  if (creative.image_url) return creative.image_url;
  
  // 5. Last resort: thumbnail
  return creative.thumbnail_url;
}
```

### Preview Dialog Features

The new `CreativePreviewDialog` component will include:
- Large image display with proper aspect ratio
- Image zoom on hover or click
- Creative metadata (name, asset type, content type, angle, etc.)
- Quick performance stats (spend, installs, CTR, CPI)
- "View Platform Breakdown" button for blended creatives
- Video playback for video assets (if the full video URL is available)

---

## User Experience Flow

```text
Card Click (any mode)
    │
    ├─► Opens CreativePreviewDialog
    │       │
    │       └─► Shows large image/video + metrics
    │           │
    │           └─► "View Breakdown" button (blended only)
    │                   │
    │                   └─► Opens CreativeBreakdownDialog
```

---

## Migration Strategy

1. Deploy updated `fetch-creative-assets` function
2. Run sync with `forceRefresh: true` to re-download assets at higher resolution
3. Existing assets will be overwritten with better quality versions

---

## What Gets Created/Modified

| File | Type | Description |
|------|------|-------------|
| `supabase/functions/fetch-creative-assets/index.ts` | Modified | Fetch high-res images from `object_story_spec` |
| `src/components/reporting/CreativePreviewDialog.tsx` | New | Full-size creative preview modal |
| `src/components/reporting/CreativePerformanceGrid.tsx` | Modified | Add preview click handler |

