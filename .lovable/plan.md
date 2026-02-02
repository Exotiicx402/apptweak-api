

# Creative Performance Card Grid for Meta

## Overview

Create a new card-based grid component that displays individual creative performance with large thumbnails, matching the reference design. This will replace/complement the existing table view on the Meta sync page.

---

## What We Need to Build

### 1. Backend Changes

**Modify `meta-history` edge function** to return ad-level data:

Currently the function fetches data at `level: "campaign"`. We need to add a separate query for `level: "ad"` to get individual creative performance.

The Meta API and BigQuery sync already have ad-level data - we just need to query it differently.

```text
Current flow:
  meta-history → campaign_id/campaign_name aggregation

New flow:
  meta-history → add "ads" array with ad_name, spend, installs, impressions, clicks, ctr
```

**Update BigQuery sync** to capture ad-level data:
- Modify `meta-to-bigquery` to fetch at ad level instead of campaign level
- Add `ad_id` and `ad_name` columns to the sync

---

### 2. New Frontend Component: `CreativeCardGrid`

Create `src/components/dashboard/CreativeCardGrid.tsx`:

```text
+-------------------------------------------+
| Top Creatives                             |
+-------------------------------------------+
|  +--------+  +--------+  +--------+  +---+|
|  |        |  |        |  |        |  |   ||
|  | [IMG]  |  | [VID]  |  | [IMG]  |  |   ||
|  |        |  |        |  |        |  |   ||
|  +--------+  +--------+  +--------+  +---+|
|  Name...     Name...     Name...          |
|  Spend $X    Spend $X    Spend $X         |
|  Installs N  Installs N  Installs N       |
|  CTR X.X%    CTR X.X%    CTR X.X%         |
|  CPI $X.XX   CPI $X.XX   CPI $X.XX        |
+-------------------------------------------+
```

**Card features:**
- Large thumbnail (aspect ratio maintained)
- Asset type badge overlay (Image/Video)
- Truncated creative name with tooltip
- Key metrics: Spend, App installs, CTR (link click), CPI

---

### 3. Data Flow

```text
1. meta-history returns:
   {
     daily: [...],
     campaigns: [...],
     ads: [                         // NEW
       {
         ad_id: string,
         ad_name: string,           // Matches creative_name in creative_assets
         spend: number,
         installs: number,
         impressions: number,
         clicks: number,
         ctr: number,
         cpi: number,
       }
     ],
     totals: {...},
   }

2. Frontend calls useCreativeAssets(adNames) to get thumbnail URLs

3. CreativeCardGrid renders cards with matched thumbnails
```

---

## Implementation Steps

### Step 1: Update meta-to-bigquery sync

Add ad-level fields to BigQuery sync:
- Change `level` from "campaign" to "ad"
- Add `ad_id`, `ad_name` columns
- Keep `campaign_id`, `campaign_name` for filtering

### Step 2: Update meta-history edge function

Add new query for ad-level data:
```sql
SELECT 
  ad_id,
  ad_name,
  SUM(spend) as spend,
  SUM(impressions) as impressions,
  SUM(clicks) as clicks,
  SUM(installs) as installs
FROM meta_ads_table
WHERE DATE(timestamp) BETWEEN start AND end
  AND UPPER(campaign_name) LIKE '%APP INSTALLS%'
GROUP BY ad_id, ad_name
ORDER BY spend DESC
LIMIT 50
```

### Step 3: Create CreativeCardGrid component

New file: `src/components/dashboard/CreativeCardGrid.tsx`

Props:
```typescript
interface CreativeCardGridProps {
  title: string;
  data: Array<{
    adName: string;
    spend: number;
    installs: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpi: number;
  }>;
  loading?: boolean;
}
```

Card layout based on reference image:
- 4 columns on large screens, 2 on medium, 1 on mobile
- 16:9 or square aspect ratio for thumbnail
- Badge overlay for Image/Video
- Metrics displayed below thumbnail

### Step 4: Update useMetaHistory hook

Add `ads` array to the data interface and fetch logic.

### Step 5: Update MetaHistoryDashboard

Add the new `CreativeCardGrid` component below the existing charts:

```tsx
{/* Top Creatives - Card Grid */}
<CreativeCardGrid
  title="Top Creatives"
  data={adsData}
  loading={isLoading}
/>
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `supabase/functions/meta-to-bigquery/index.ts` | Modify to sync at ad level |
| `supabase/functions/meta-history/index.ts` | Add ads query and response |
| `src/hooks/useMetaHistory.ts` | Add ads interface |
| `src/components/dashboard/CreativeCardGrid.tsx` | **New component** |
| `src/components/dashboard/MetaHistoryDashboard.tsx` | Add CreativeCardGrid |

---

## Technical Notes

### Matching Creatives to Assets

The ad name in Meta follows your naming convention:
`Page | ContentType | AssetType | ConceptID | Category | Angle | UNIQUEIDENTIFIER | ...`

The `creative_assets` table already has `creative_name` that matches this exactly. The existing `useCreativeAssets` hook will work for lookups.

### Performance Considerations

- Limit to top 50 creatives by spend to avoid overwhelming the UI
- Use lazy loading for images
- Cache creative asset lookups (already implemented with 5-min stale time)

### Asset Type Detection

Parse from naming convention (position 3 = AssetType):
- `IMG` → Image badge
- `VID`, `VID-MV`, `VID-LV` → Video badge

Or use `asset_type` from `creative_assets` table.

