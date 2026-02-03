

# Fix: Meta History Edge Function Error on Reporting Page

## Problem

The `/reporting` page shows **"Failed to load: Edge Function returned a non-2xx status code"** for Meta Ads because the `meta-history` edge function is failing with:

```
BigQuery error: "Unrecognized name: ad_id at [22:11]"
```

## Root Cause

The recent update to add ad-level creative data to `meta-history` introduced a query for `ad_id` and `ad_name` columns. However:

1. These columns don't exist in your BigQuery table yet (the sync hasn't run with the new schema)
2. The ads query is executed in parallel with other queries
3. When the BigQuery query fails, the entire function throws an error

## Solution

Make the ads query **fault-tolerant** by wrapping it in a try-catch. If the query fails (e.g., columns don't exist), the function should:
- Log a warning
- Return an empty `ads` array
- Continue returning all other data successfully

This allows the reporting page to work immediately while you run the updated sync to populate ad-level data.

---

## Implementation

### File to Modify
`supabase/functions/meta-history/index.ts`

### Changes

1. **Wrap the ads query in try-catch** to handle schema mismatches gracefully

2. **Execute ads query separately** from critical queries so its failure doesn't block the main response

---

## Code Changes

**Current problematic code (line ~462):**
```typescript
let [bqDailyData, bqCampaignData, bqTotalsData, bqAdsData, prevTotalsData, prevDatesData, liveData] = await Promise.all(promises);
```

**Updated approach:**
```typescript
// Execute critical queries in parallel
let [bqDailyData, bqCampaignData, bqTotalsData, prevTotalsData, prevDatesData, liveData] = await Promise.all(criticalPromises);

// Try ads query separately - non-blocking if schema doesn't support it yet
let bqAdsData = [];
if (adsQuery) {
  try {
    bqAdsData = await queryBigQuery(adsQuery, googleAccessToken);
  } catch (adsError) {
    console.warn("Ads query failed (columns may not exist yet):", adsError.message);
    // Continue without ads data - the creative grid will just be empty
  }
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/meta-history/index.ts` | Make ads query fault-tolerant with try-catch |

---

## What Happens After This Fix

1. **Immediate**: The reporting page will load Meta data without errors
2. **Empty ads grid**: The "Top Creatives" grid on `/meta-sync` will be empty until you run the updated BigQuery sync
3. **After sync**: Once you run `meta-to-bigquery` with the new schema (which adds `ad_id` and `ad_name` columns), the creative grid will populate

---

## Alternative Option

If you prefer to add the columns to BigQuery first instead:
1. Run the `meta-to-bigquery` sync for recent dates
2. This will automatically add `ad_id` and `ad_name` columns to the table
3. The function will then work without any code changes

However, the fault-tolerant approach is recommended as it makes the system more resilient to schema changes.

