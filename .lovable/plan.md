

## Manual Google Ads Data Override for Feb 11

Since the BigQuery table hasn't synced Feb 11 data yet, I'll add a temporary manual override in the `google-ads-history` edge function that injects the known values when BigQuery returns empty results for that date.

### What changes

**File: `supabase/functions/google-ads-history/index.ts`**

Add a manual overrides map near the top of the function. When BigQuery returns 0 spend for a date that has a manual override, the override values will be used instead.

```
Manual overrides map:
  "2026-02-11" -> { spend: 1412.20, installs: 172, cpi: 8.21 }
```

This will apply to:
- The `totals` object (so the reporting page and Slack report show correct numbers)
- The `daily` array (so time series charts reflect the data point)

The override is additive -- if BigQuery eventually syncs the real data, the override will be ignored since totals will be non-zero.

### Technical details

- A `MANUAL_OVERRIDES` constant will map date strings to `{ spend, installs, cpi }` objects
- After computing totals from BigQuery, if `totals.spend === 0` and the queried range is a single day matching an override key, the override values replace the totals and inject a daily row
- For multi-day ranges that include an overridden date, the override row will be merged into the daily array and totals will be augmented
- This is designed as a temporary measure, easy to remove once the sync catches up
