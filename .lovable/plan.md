

# Creative Analytics Enhancement

## Current State
The creative section shows individual ad cards with metrics and attribute badges (Angle, Tactic, Hook). Filtering exists but there's no **aggregated view** that answers "which Angles/Tactics/Hooks perform best overall?"

## Proposed Features

### 1. Attribute Performance Leaderboards
A new tabbed section above the card grid showing aggregated performance **by attribute dimension**. Each tab (Angle, Tactic, Hook, Content Type, Category) displays a ranked bar chart or mini-table:

```text
┌─────────────────────────────────────────────────────┐
│  [Angle] [Tactic] [Hook] [Content Type] [Category]  │
├─────────────────────────────────────────────────────┤
│  Angle          Spend      FTDs   CFTD    CTR       │
│  ──────         ─────      ────   ────    ───       │
│  Offer          $45k       114    $395    1.49%     │
│  USP            $24k        70    $346    1.00%     │
│  FOMO           $6k         23    $258    13.0%     │
│  MarketOdds     $6k         23    $258    13.0%     │
│  ░░░░░░░░░░░░░░░░░░░░░  (horizontal bar chart)     │
└─────────────────────────────────────────────────────┘
```

- Rows sorted by spend (or user-selectable: FTDs, CFTD, CTR)
- Horizontal spend bar behind each row for visual weight
- Clicking a row auto-applies that attribute as a filter on the grid below

### 2. Sort Controls for Card Grid
Add a "Sort by" dropdown to the grid header: Spend, FTDs, CFTD (low is good), CPI, CTR, Installs. Currently hardcoded to spend descending.

### 3. Quick-Stat Summary Bar
A compact row of 4-5 chips between the leaderboard and the grid showing totals for the current filter selection:
- Total Spend, Total FTDs, Avg CFTD, Avg CTR, Creative Count

### Technical Details

**New component**: `src/components/reporting/AttributeLeaderboard.tsx`
- Accepts the full `EnrichedCreative[]` array
- Groups by selected attribute key, aggregates spend/installs/ftds/clicks/impressions
- Computes derived metrics (CFTD, CTR, CPI) from aggregated raw totals
- Renders a tabbed view with sortable mini-table + inline bar visualization
- Emits `onAttributeClick(key, value)` to set filters on the parent grid

**New component**: `src/components/reporting/CreativeSummaryBar.tsx`
- Shows aggregated stats for whatever is currently filtered

**Modified files**:
- `src/components/reporting/CreativePerformanceGrid.tsx` -- add sort dropdown state, integrate leaderboard + summary bar, wire up click-to-filter from leaderboard
- `src/hooks/useMultiPlatformCreatives.ts` -- expose raw totals for proper aggregation (if not already available)

**No backend changes needed** -- all aggregation is client-side from existing data.

