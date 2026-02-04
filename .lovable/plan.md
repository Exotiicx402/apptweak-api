
# Creative Performance Tracking - Meta Ads

## Overview
Add creative-level performance tracking to the Reporting page, displaying cards for each ad with metadata automatically parsed from the naming convention. This phase focuses on Meta only and excludes actual asset thumbnails.

---

## Naming Convention Reference

The ad names follow a 12-part pipe-delimited convention:

| Position | Field | Example |
|----------|-------|---------|
| 1 | Page | Polymarket |
| 2 | ContentType | Trend |
| 3 | AssetType | IMG, VID, CAR |
| 4 | ConceptID | 48 |
| 5 | Category | Culture |
| 6 | Angle | OddsBoosts |
| 7 | UNIQUEIDENTIFIER | GrammysBestNewArtist |
| 8 | Tactic | Comparison |
| 9 | CreativeOwner | Matthis |
| 10 | Objective | Traffic |
| 11 | INPUT-LP-HERE | Market LP |
| 12 | LaunchDate | 1/29 |

---

## Implementation Plan

### Phase 1: Parsing Utility

**File:** `src/lib/creativeNamingParser.ts` (new)

Create a utility function to parse ad names:

```text
parseCreativeName(adName: string) => {
  page: string;
  contentType: string;
  assetType: string;      // IMG, VID, CAR
  conceptId: string;
  category: string;
  angle: string;
  uniqueIdentifier: string;
  tactic: string;
  creativeOwner: string;
  objective: string;
  landingPage: string;
  launchDate: string;
}
```

The parser will:
- Split on ` | ` (pipe with spaces)
- Trim each part
- Return empty strings for missing positions
- Handle edge cases (malformed names, fewer than 12 parts)

---

### Phase 2: Creative Performance Hook

**File:** `src/hooks/useCreativePerformance.ts` (new)

Create a hook that:
1. Calls the existing `meta-history` edge function with the date range
2. Extracts the `ads` array from the response
3. Parses each ad name using the utility function
4. Returns enriched creative data with parsed metadata

**Data structure returned:**
```text
{
  adId: string;
  adName: string;
  spend: number;
  installs: number;
  ctr: number;
  cpi: number;
  parsed: {
    angle: string;
    tactic: string;
    assetType: string;
    category: string;
    conceptId: string;
    creativeOwner: string;
    launchDate: string;
  };
}
```

---

### Phase 3: Creative Performance Cards Component

**File:** `src/components/reporting/CreativePerformanceGrid.tsx` (new)

Design goals:
- Card-based layout (similar to existing `CreativeCardGrid`)
- No thumbnails (placeholder icon based on asset type)
- Display parsed metadata prominently

**Card layout:**
```text
+----------------------------------+
|  [Icon: IMG/VID]   AssetType     |
+----------------------------------+
|  Creative Name (truncated)       |
|                                  |
|  Angle: OddsBoosts               |
|  Tactic: Comparison              |
|  Category: Culture               |
|                                  |
|  +-------+  +-------+            |
|  | Spend |  |Installs|           |
|  | $XXX  |  |  XXX   |           |
|  +-------+  +-------+            |
|  +-------+  +-------+            |
|  |  CTR  |  |  CPI  |            |
|  | X.XX% |  | $X.XX |            |
|  +-------+  +-------+            |
+----------------------------------+
```

Key features:
- Badges for Angle, Tactic, Category
- Asset type icon (Image vs Video vs Carousel)
- Tooltip on creative name showing full name
- Sorted by spend (descending)
- Top 25 creatives displayed

---

### Phase 4: Integration with Reporting Page

**File:** `src/pages/Reporting.tsx`

Add the creative performance grid below the ranking section:
- Uses the same `appliedStartDate` and `appliedEndDate` as other sections
- Only renders after data is fetched
- Shows loading skeleton while fetching

---

## Technical Details

### Data Flow

```text
1. User selects date range → clicks Apply
2. useCreativePerformance hook calls meta-history edge function
3. Edge function returns ads[] from BigQuery (already implemented)
4. Hook parses each ad_name using creativeNamingParser
5. CreativePerformanceGrid displays enriched cards
```

### No Backend Changes Required

The existing `meta-history` edge function already:
- Fetches ad-level data from BigQuery
- Returns `ad_id` and `ad_name` in the response
- Supports date range filtering

All parsing happens client-side.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/creativeNamingParser.ts` | Utility to parse naming convention |
| `src/hooks/useCreativePerformance.ts` | Hook to fetch and enrich creative data |
| `src/components/reporting/CreativePerformanceGrid.tsx` | Card grid component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Reporting.tsx` | Import and render CreativePerformanceGrid |

---

## Future Enhancements (Not In Scope)
- Add thumbnail images from creative_assets table
- Filter/group by Angle, Tactic, or Category
- Expand to Snapchat, TikTok platforms
- Export creative performance data
