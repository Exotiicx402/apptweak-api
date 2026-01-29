
## Add Date Range Preview for Unity Ads

### Overview
Enable previewing Unity Ads data for a date range (start and end date) instead of just a single day. This will help you verify data across multiple days before syncing.

---

### Changes Required

| Component | Change |
|-----------|--------|
| Edge Function | Accept `startDate` and `endDate` parameters, fetch data for the full range |
| Hook | Update to support date range parameters |
| UI | Replace single date picker with start/end date pickers |

---

### Implementation Details

#### 1. Edge Function (`supabase/functions/unity-preview/index.ts`)

**Current behavior:** Accepts a single `date` parameter and fetches one day of data.

**New behavior:** Accept `startDate` and `endDate` parameters. The Unity API already supports date ranges natively (it has `start` and `end` parameters), so we just need to pass them through.

```text
Request body options:
- { startDate: "2026-01-20", endDate: "2026-01-28" }  -> Range
- { date: "2026-01-28" }  -> Single day (backward compatible)
- {}  -> Yesterday (default)
```

The response will include `startDate` and `endDate` fields instead of just `date`.

#### 2. Hook (`src/hooks/useUnityPreview.ts`)

Update the `fetchPreview` function signature:
- Add optional `startDate` and `endDate` parameters
- Update the result interface to include the date range

#### 3. UI (`src/pages/UnitySync.tsx`)

Replace the single date picker in the Preview section with:
- Start Date input
- End Date input  
- "Preview Yesterday" button (uses yesterday as both start and end)
- "Preview Range" button

Add date preset buttons similar to the backfill section for quick selection (Last 7 days, etc.).

---

### Technical Details

**Unity API Behavior:**
The Unity Statistics API v2 already accepts `start` and `end` parameters. Currently the edge function adds +1 day to the end date because Unity requires end > start. For true date ranges, we'll pass `endDate + 1 day` to include the full end date in results.

**Aggregation:**
The summary statistics (total spend, installs, CPI, etc.) will be calculated across the entire date range, giving you an aggregate view.

**Response format change:**
```javascript
// New response format
{
  success: true,
  data: [...],
  summary: {...},
  startDate: "2026-01-20",
  endDate: "2026-01-28",
  durationMs: 1234
}
```
