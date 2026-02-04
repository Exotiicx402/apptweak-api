

# Switch Snapchat to Impression Time Attribution

## Overview

Change Snapchat API calls from `action_report_time: 'conversion'` to `action_report_time: 'impression'` to match the Snapchat platform reporting exactly.

---

## What This Changes

| Metric | Current (conversion) | After (impression) |
|--------|---------------------|-------------------|
| Spend | $5,000 | $5,000 (no change) |
| Installs | 487 | ~213 (matches platform) |
| Attribution | Day user installed | Day ad was shown |

---

## Files to Update

### 1. Live API for Today's Data

**File:** `supabase/functions/snapchat-history/index.ts`

**Line 235** - Change:
```typescript
// Before
url.searchParams.set('action_report_time', 'conversion');

// After
url.searchParams.set('action_report_time', 'impression');
```

**Lines 494-498** - Update attribution settings in response:
```typescript
attributionSettings: {
  swipe_up_attribution_window: '28_DAY',
  view_attribution_window: '1_DAY',
  action_report_time: 'impression',
  note: 'Installs are credited to the day the ad was shown, matching Snapchat platform reporting.',
},
```

### 2. BigQuery Sync (Historical Data)

**File:** `supabase/functions/snapchat-to-bigquery/index.ts`

**Line 375** - Change:
```typescript
// Before
url.searchParams.set('action_report_time', 'conversion');

// After
url.searchParams.set('action_report_time', 'impression');
```

---

## Post-Implementation Steps

After deploying these changes:

1. **Re-sync historical data** - The existing BigQuery data was synced with `conversion` time. We need to backfill with `impression` time to get accurate historical installs.

2. **Recommended backfill range**: Last 30 days minimum, since conversion-time installs may have been incorrectly attributed.

---

## Summary

| File | Change |
|------|--------|
| `supabase/functions/snapchat-history/index.ts` | Line 235: Change `conversion` to `impression` |
| `supabase/functions/snapchat-to-bigquery/index.ts` | Line 375: Change `conversion` to `impression` |

---

## Expected Outcome

After implementation and data re-sync:
- Install numbers will match Snapchat platform exactly
- Spend remains accurate (unchanged by this setting)
- CPI will be recalculated based on correct install counts

