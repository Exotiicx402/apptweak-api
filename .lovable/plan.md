

# Fix Moloco BigQuery Table and Add Auto-Backfill

## Problem

The BigQuery table `polymarket-data-house.polymarket_hours.moloco-lv` exists but has **no schema** (no columns). This causes the `moloco-history` edge function to fail with:

```
Table polymarket-data-house.polymarket_hours.moloco-lv does not have a schema.
```

## Solution Overview

1. **Fix BigQuery table** by running SQL to add the required schema
2. **Update `moloco-history`** to add auto-backfill logic that:
   - Detects when BigQuery returns empty results for dates within the last 14 days
   - Fetches missing data from the live Moloco API
   - Caches the data back to BigQuery (write-back pattern)

---

## Step 1: Fix BigQuery Table Schema

Run this SQL in BigQuery Console to drop and recreate the table with proper columns:

```sql
-- Drop the schema-less table
DROP TABLE IF EXISTS `polymarket-data-house.polymarket_hours.moloco-lv`;

-- Create with proper schema
CREATE TABLE `polymarket-data-house.polymarket_hours.moloco-lv` (
  date DATE NOT NULL,
  campaign_id STRING NOT NULL,
  campaign_name STRING,
  spend FLOAT64,
  installs INT64,
  impressions INT64,
  clicks INT64,
  fetched_at TIMESTAMP
);
```

After running this, the table will be ready for the edge function to query and write data.

---

## Step 2: Update `moloco-history` Edge Function

Add auto-backfill logic similar to what we implemented for Meta. The function will:

1. Query BigQuery for historical data
2. Identify which dates within the last 14 days are missing from BigQuery
3. Fetch those missing dates from the live Moloco API
4. Merge the live data into BigQuery for future queries
5. Return combined results

### Key Changes

**File: `supabase/functions/moloco-history/index.ts`**

Add helper functions:
```typescript
function isWithinLastNDays(dateStr: string, n: number): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  const diffMs = today.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= n && diffDays >= 0;
}

function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}
```

Update main handler logic to:
1. After BigQuery query, identify which dates are missing
2. For missing dates within last 14 days, call `fetchMolocoLiveData`
3. Merge results and cache to BigQuery

```text
Current Flow:
  Query BQ for historical → Fetch live for today → Return

New Flow:
  Query BQ for historical
  ↓
  Check for missing dates within 14-day window
  ↓
  If missing dates exist → Fetch from Moloco API
  ↓
  Merge all data together
  ↓
  Cache new data to BigQuery
  ↓
  Return combined results
```

---

## Expected Behavior After Fix

| Scenario | Result |
|----------|--------|
| BigQuery has all data | Returns BigQuery data (fast) |
| BigQuery missing recent dates (≤14 days) | Fetches from Moloco API, caches, returns data |
| BigQuery missing old dates (>14 days) | Returns available data only |
| Today's data | Always fetched live from Moloco API |

---

## Files to Modify

- `supabase/functions/moloco-history/index.ts` - Add backfill logic

## Rate Limit Consideration

The Moloco API has a 300 requests/5 minutes limit. The backfill logic fetches date ranges in a single API call rather than per-day calls, minimizing API usage while still ensuring data completeness.

