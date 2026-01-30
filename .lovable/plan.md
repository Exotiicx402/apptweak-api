

## Fix Google Ads History BigQuery Schema Mismatch

### Problem Analysis

The edge function is querying the table `google_Final` but the column `date` doesn't exist in that table. The screenshot showed a schema with a `date` column, but that appears to be from a different table than what's actually being queried (`google_Final` vs `google`).

**Evidence:**
- Edge function logs show: `Querying Google Ads data from: polymarket-data-house.polymarket_hours.google_Final`
- BigQuery error: `Unrecognized name: date at [10:13]`
- The `GOOGLE_ADS_BQ_TABLE_ID` secret is set to `google_Final`, not `google`

### Root Cause

There are two possibilities:
1. The `google_Final` table uses a different column name for dates (e.g., `timestamp`, `day`, `report_date`)
2. The screenshot you shared was from the wrong table

### Solution Options

**Option A: Query the actual schema**
I can create a temporary diagnostic query to fetch the exact schema of `google_Final` so we know the correct column names.

**Option B: Update the table name**
If the screenshot you shared (showing the `date` column) is from the correct table named `google` (not `google_Final`), then we need to update the `GOOGLE_ADS_BQ_TABLE_ID` secret from `google_Final` to `google`.

**Option C: Manual schema sharing**
You can run this query in BigQuery and share the results:
```sql
SELECT column_name, data_type 
FROM `polymarket-data-house.polymarket_hours.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'google_Final'
ORDER BY ordinal_position
```

### Recommended Approach

**I recommend Option B** - Update the secret to point to `google` instead of `google_Final`, since:
1. You explicitly said "The table name in big qquery for google is 'google'"
2. The screenshot shows a table with the schema we expect (date, campaign, spend, clicks, conversions, etc.)
3. This is the quickest fix

### Changes Required

1. **Update Secret**: Change `GOOGLE_ADS_BQ_TABLE_ID` from `google_Final` to `google` (or the full path `polymarket-data-house.polymarket_hours.google`)

2. **No code changes needed** - The edge function is already correctly written for the schema shown in your screenshot

### Alternative: If google_Final is the correct table

If `google_Final` IS the correct table to use, then we need to know its actual schema. The most likely scenario is that it uses `timestamp` instead of `date`, in which case the queries would need to use:
```sql
SELECT 
  DATE(timestamp) as date,
  ...
WHERE DATE(timestamp) BETWEEN '2025-01-01' AND '2025-01-30'
```

But this requires confirmation of the actual column names in `google_Final`.

