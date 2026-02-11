

# Fix Google Ads Duplicate Data in BigQuery Queries

## Problem
Windsor.ai has synced duplicate rows into the Google Ads BigQuery table. The `google-ads-history` edge function SUMs all rows without deduplication, resulting in metrics that are exactly 2x the actual Google Ads values (e.g., $3,032 vs real $1,570 spend).

## Root Cause
The Windsor-populated table lacks a MERGE/upsert mechanism, so repeated syncs create duplicate rows with identical `date`, `campaign`, `spend`, etc. values.

## Solution
Add a deduplication CTE to all queries in `google-ads-history/index.ts`. This uses `ROW_NUMBER()` to keep only one row per unique combination of dimensions, eliminating duplicates regardless of how many times Windsor synced.

## Changes

### `supabase/functions/google-ads-history/index.ts`

Wrap all queries with a deduplication CTE that filters out duplicate rows before aggregation:

```text
WITH deduped AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY date, campaign, spend, clicks, conversions
    ORDER BY date
  ) AS rn
  FROM table
  WHERE date BETWEEN ...
)
SELECT ... FROM deduped WHERE rn = 1
```

This is applied to all 5 query types:
1. **Daily query** -- aggregates by date
2. **Campaign query** -- aggregates by campaign
3. **Ads query** -- aggregates by asset_name
4. **Totals query** -- overall totals for current period
5. **Previous totals query** -- overall totals for comparison period

### Why `PARTITION BY date, campaign, spend, clicks, conversions`?
Since Windsor doesn't provide a unique row ID, we partition by the full set of dimension + metric columns. Truly duplicate rows (same date, same campaign, same values) will be collapsed to one. Rows that differ in any value are preserved.

## No Other Files Changed
The `google-ads-to-bigquery` function already uses MERGE and is unaffected. The frontend code doesn't need changes -- it will simply receive correct numbers.

## Impact
- Google Ads metrics will immediately show correct values matching Google's dashboard
- All historical date ranges will also be corrected
- The fix is purely in the SQL layer, so no data is modified in BigQuery

