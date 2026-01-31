

# Fix: Meta Ads Showing 0 for Yesterday Due to Missing BigQuery Data

## Problem

When querying for January 30th (yesterday in your local timezone), Meta is returning 0 because:

1. The `meta-history` function only calls the live Meta API when `endDate >= today` (in UTC)
2. For historical dates (like yesterday), it queries BigQuery exclusively
3. BigQuery doesn't have January 30th data yet - the sync may be lagging due to timezone differences

The root cause is a **timezone mismatch** between:
- Your local timezone (used by the frontend)
- UTC (used by the server for determining "today" and "yesterday")

## Solution: Query Live API for Missing Recent Data

Update `meta-history` to detect when BigQuery returns empty for recent dates and fall back to the live Meta API. This ensures you always get data for dates the live API can provide, even if BigQuery sync is delayed.

---

## Technical Details

### File: `supabase/functions/meta-history/index.ts`

**Current logic:**
```text
if endDate includes today → call live API for today
else → query BigQuery only
```

**New logic:**
```text
1. Query BigQuery for the date range
2. If BigQuery returns empty AND the date range is within last 7 days:
   a. Call live Meta API directly for those dates
   b. Cache the results back to BigQuery
3. Always call live API for today's data
```

**Key changes:**

1. **Add missing data detection**: After querying BigQuery, check if any requested dates returned empty
2. **Fallback to live API**: For recent empty dates (within Meta's 7-day attribution window), fetch from live API
3. **Optional caching**: Merge fetched live data into BigQuery for future requests

**Example implementation:**
```typescript
// After BigQuery query
if (bqDailyData.length === 0 && isWithinLastNDays(startDate, 7)) {
  console.log('BigQuery returned no data for recent range, falling back to live API');
  const liveData = await fetchMetaInsightsRange(startDate, endDate);
  // Process and use liveData instead
}
```

---

## Alternative Quick Fix

If you want a simpler fix: manually trigger a sync for yesterday's data:

1. Call `meta-to-bigquery` with `{ "date": "2026-01-30" }` to sync yesterday's data
2. Then query the reporting page again

However, this doesn't solve the underlying issue - the recommended fix above prevents this from happening again.

---

## Files to Modify

- `supabase/functions/meta-history/index.ts`

## Expected Result After Fix

| Query Date | BigQuery Has Data | Result |
|------------|-------------------|--------|
| Yesterday | Yes | Returns BigQuery data |
| Yesterday | No | Falls back to live API, returns data |
| Today | N/A | Always calls live API |
| 2+ weeks ago | No | Returns empty (beyond live API window) |

