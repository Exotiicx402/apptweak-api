

## Fix Google Ads History Edge Function

### Problem
The `google-ads-history` edge function uses Google Ads API column names (`segments_date`, `metrics_cost_micros`, `metrics_conversions`) but Windsor syncs data with simplified column names matching the pattern used in Meta and Snapchat tables.

### Solution
Update the SQL queries to use Windsor's standard column naming convention, matching the pattern from your working Snapchat and Meta integrations.

---

### Changes to Make

**File:** `supabase/functions/google-ads-history/index.ts`

Update all SQL queries to use Windsor column names:

| Current (Google Ads API style) | New (Windsor style) |
|-------------------------------|---------------------|
| `segments_date` | `timestamp` or `date` |
| `metrics_cost_micros / 1000000` | `spend` |
| `metrics_impressions` | `impressions` |
| `metrics_clicks` | `clicks` |
| `metrics_conversions` | `conversions` or `installs` |

---

### Updated Queries

**Daily Query:**
```sql
SELECT 
  DATE(timestamp) as date,
  SUM(spend) as spend,
  SUM(impressions) as impressions,
  SUM(clicks) as clicks,
  SUM(conversions) as installs
FROM `project.dataset.google`
WHERE DATE(timestamp) BETWEEN '2025-01-01' AND '2025-01-30'
GROUP BY date
ORDER BY date
```

**Totals Query:**
```sql
SELECT 
  SUM(spend) as total_spend,
  SUM(impressions) as total_impressions,
  SUM(clicks) as total_clicks,
  SUM(conversions) as total_installs,
  SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi
FROM `project.dataset.google`
WHERE DATE(timestamp) BETWEEN '2025-01-01' AND '2025-01-30'
```

---

### Configuration Update

Since you said the table name is "google" (not "google_Final"), I'll also update the edge function to handle both:
- Using `GOOGLE_ADS_BQ_TABLE_ID` if set to a full path like `project.dataset.google`
- Or falling back to `BQ_PROJECT_ID.BQ_DATASET_ID.google`

---

### Technical Note

If the column names differ from what I've assumed (based on Meta/Snapchat patterns), the error message will tell us the exact column name that doesn't exist, and we can adjust. Common Windsor variations:
- `date` instead of `timestamp`
- `installs` instead of `conversions`
- `cost` instead of `spend`

