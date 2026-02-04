

# Update TikTok History for Ad-Level Creative Data

## Summary

Update the `tiktok-history` edge function to fetch ad-level creative data using only `ad_name` (since it already exists in BigQuery). This is an **additional query** that won't affect the existing stats queries.

## Current Problem

The existing ad-level query (lines 188-204) filters on `ad_id IS NOT NULL` which fails because `ad_id` doesn't exist in the TikTok BigQuery table.

## Change Required

### File: `supabase/functions/tiktok-history/index.ts`

**Update the adsQuery (lines 188-204):**

```sql
-- FROM (current - broken):
SELECT ad_id, ad_name, SUM(spend) as spend, ...
WHERE ad_id IS NOT NULL AND ad_id != ''
GROUP BY ad_id, ad_name

-- TO (fixed):
SELECT ad_name, SUM(spend) as spend, ...
WHERE ad_name IS NOT NULL AND ad_name != ''
GROUP BY ad_name
```

**Update the response mapping (lines 273-281):**

Remove `ad_id` from the response since we're not using it.

## Technical Details

| Section | Change |
|---------|--------|
| `adsQuery` | Remove `ad_id`, filter by `ad_name IS NOT NULL`, group by `ad_name` only |
| Response `ads` array | Remove `ad_id` field, keep only `ad_name` with metrics |
| Totals/Daily/Campaign queries | **No changes** - these remain untouched |

## Expected Result

After deployment:
- TikTok creative cards will appear immediately on the Reporting page
- Aggregate stats (spend, installs, CPI) remain unaffected
- The `ads` array in the response will contain creatives grouped by `ad_name`

