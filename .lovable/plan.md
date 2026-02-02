

# Creative Asset Preview System

## Overview

Build a system to download, store, and display creative assets (images/videos) alongside performance data. Since all assets follow the same naming convention across platforms, we can use the creative name as the lookup key to match assets to their previews.

---

## Architecture

The system will:
1. Fetch creative thumbnail/preview URLs from each platform's API
2. Download and store assets in a Lovable Cloud storage bucket
3. Store asset metadata in a database table mapping creative names to storage URLs
4. Display thumbnails in the CreativeReportingTable component

```text
Platform APIs                     Storage                      Frontend
    |                                |                             |
    v                                v                             v
+------------+     +---------------+     +------------------+
| Meta API   | --> | Edge Function | --> | Storage Bucket   |
| (creatives)|     | fetch-assets  |     | (creative-assets)|
+------------+     +---------------+     +------------------+
| Snapchat   |            |                      |
| Unity      |            v                      v
| etc.       |     +--------------+     +------------------+
+------------+     | creative_    | --> | CreativeTable    |
                   | assets table |     | with thumbnails  |
                   +--------------+     +------------------+
```

---

## Implementation Steps

### Phase 1: Database and Storage Setup

**1. Create storage bucket for creative assets**

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-assets', 'creative-assets', true);

-- RLS policy for public read access
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'creative-assets');

-- Service role can insert/update
CREATE POLICY "Service role can upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'creative-assets');
```

**2. Create creative_assets metadata table**

```sql
CREATE TABLE public.creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_name TEXT NOT NULL,              -- The full naming convention string
  concept_id TEXT,                          -- Extracted from name (for faster lookups)
  unique_identifier TEXT,                   -- Extracted from name
  platform TEXT NOT NULL,                   -- 'meta', 'snapchat', 'unity', 'tiktok', etc.
  platform_creative_id TEXT,                -- Original ID from platform
  asset_type TEXT,                          -- 'image', 'video', 'playable'
  thumbnail_url TEXT,                       -- URL in our storage bucket
  original_url TEXT,                        -- Original URL from platform (for refresh)
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, platform_creative_id)
);

-- Index for fast lookups by creative name
CREATE INDEX idx_creative_assets_name ON creative_assets(creative_name);
CREATE INDEX idx_creative_assets_concept ON creative_assets(concept_id);
```

---

### Phase 2: Edge Function to Fetch and Store Assets

**3. Create `fetch-creative-assets` edge function**

This function will:
- Call each platform's API to get creative details with thumbnail URLs
- Download the assets
- Upload to the storage bucket
- Store metadata in the creative_assets table

**Platform-specific API calls:**

| Platform | API Endpoint | Fields for Thumbnails |
|----------|--------------|----------------------|
| Meta | `/{ad-id}/adcreatives?fields=name,thumbnail_url,image_url,video_id` | `thumbnail_url`, `image_url` |
| Snapchat | `/v1/adaccounts/{id}/creatives` then `/v1/media/{media_id}` | `download_link` from media |
| Unity | Creative Packs API | Creative pack metadata |
| TikTok | `/ad/get/?fields=video_id,image_ids` | Video/image preview URLs |

**Function flow:**
```text
1. Get list of all ads/creatives from platform API
2. For each creative:
   a. Extract the creative name (your naming convention)
   b. Parse out ConceptID and UniqueIdentifier for indexing
   c. Check if already exists in creative_assets table
   d. If not exists or needs refresh:
      - Download thumbnail/preview from platform
      - Upload to storage bucket as: creative-assets/{platform}/{concept_id}/{filename}
      - Insert/update creative_assets record
3. Return count of assets processed
```

---

### Phase 3: Frontend Integration

**4. Update CreativeReportingTable to show thumbnails**

Add a thumbnail column that looks up images by creative name:

```typescript
interface CreativeReportingTableProps {
  title: string;
  data: Array<{
    name: string;
    thumbnailUrl?: string;  // NEW: URL from creative_assets table
    spend: number;
    installs: number;
    // ... rest of fields
  }>;
}
```

The table cell would render:
```tsx
<TableCell className="w-12">
  {row.thumbnailUrl ? (
    <img 
      src={row.thumbnailUrl} 
      alt={row.name}
      className="w-10 h-10 rounded object-cover"
    />
  ) : (
    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
      <ImageIcon className="w-4 h-4 text-muted-foreground" />
    </div>
  )}
</TableCell>
```

**5. Create hook to fetch creative assets**

```typescript
// useCreativeAssets.ts
export function useCreativeAssets(creativeNames: string[]) {
  return useQuery({
    queryKey: ['creative-assets', creativeNames],
    queryFn: async () => {
      const { data } = await supabase
        .from('creative_assets')
        .select('creative_name, thumbnail_url')
        .in('creative_name', creativeNames);
      return new Map(data?.map(a => [a.creative_name, a.thumbnail_url]) ?? []);
    },
    enabled: creativeNames.length > 0,
  });
}
```

---

### Phase 4: Sync Integration

**6. Add asset sync to existing BigQuery sync functions**

Option A: **Separate scheduled job** (recommended)
- Create a daily scheduled job that runs `fetch-creative-assets` for each platform
- Runs independently of metrics sync
- Less impact on existing sync reliability

Option B: **Inline with metrics sync**
- Add creative fetching to each `-to-bigquery` function
- Risk: increases complexity and failure points

---

## File Changes Summary

| File | Action |
|------|--------|
| `supabase/migrations/...` | New migration for bucket + table |
| `supabase/functions/fetch-creative-assets/index.ts` | New edge function |
| `src/hooks/useCreativeAssets.ts` | New hook |
| `src/components/dashboard/CreativeReportingTable.tsx` | Add thumbnail column |
| `src/components/dashboard/MetaHistoryDashboard.tsx` | Pass thumbnails to table |
| `src/components/dashboard/SnapchatHistoryDashboard.tsx` | Pass thumbnails to table |
| `src/components/dashboard/UnityHistoryDashboard.tsx` | Pass thumbnails to table |

---

## Technical Considerations

### Naming Convention Parsing

Your naming convention:
`Page | ContentType | AssetType | ConceptID | Category | Angle | UNIQUEIDENTIFIER | Tactic | CreativeOwner | Objective | INPUT-LP-HERE | LaunchDate`

We can parse this to extract key lookup fields:
```typescript
function parseCreativeName(name: string) {
  const parts = name.split('|').map(p => p.trim());
  return {
    page: parts[0],
    contentType: parts[1],
    assetType: parts[2],
    conceptId: parts[3],        // Key for grouping
    category: parts[4],
    angle: parts[5],
    uniqueId: parts[6],         // Key for exact match
    tactic: parts[7],
    creativeOwner: parts[8],
    objective: parts[9],
    landingPage: parts[10],
    launchDate: parts[11],
  };
}
```

### Asset Storage Structure

```text
creative-assets/
  meta/
    {concept_id}/
      {unique_id}.jpg
      {unique_id}_thumb.jpg
  snapchat/
    {concept_id}/
      {unique_id}.jpg
  unity/
    ...
```

### Platform API Considerations

- **Meta**: Requires fetching ad creatives separately from insights (additional API call per ad)
- **Snapchat**: Media must be fetched via separate Media API after getting creative
- **Unity**: Creative packs API provides limited asset info
- **TikTok**: Video ads require separate video info API call

---

## Next Steps After Approval

1. Create database migration for storage bucket and creative_assets table
2. Implement fetch-creative-assets edge function (start with Meta)
3. Add frontend hook and update CreativeReportingTable
4. Extend to other platforms one by one
5. Add scheduled sync job

