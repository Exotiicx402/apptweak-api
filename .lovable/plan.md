

# Filter Meta Campaigns to Only Include "APP INSTALLS"

## Overview

Add a campaign name filter across all Meta edge functions to only include campaigns that contain "APP INSTALLS" in their name. This ensures only app install campaigns appear in:
- The reporting page totals
- The Meta historical dashboard
- BigQuery data storage
- Preview data

---

## Implementation Strategy

The filter will be applied at two key points in each function:

1. **After fetching from Meta API** - Filter the array of campaigns returned by the Graph API
2. **In BigQuery queries** - Add a WHERE clause to exclude non-matching campaigns

### Campaign Filter Logic

```typescript
function filterAppInstallCampaigns(campaigns: any[]): any[] {
  return campaigns.filter(
    (c) => c.campaign_name?.toUpperCase().includes("APP INSTALLS")
  );
}
```

---

## Files to Modify

### 1. `supabase/functions/meta-history/index.ts`

**Changes:**
- Add `filterAppInstallCampaigns` helper function
- Apply filter to `fetchMetaInsights` results in both the live API fetch for today and the fallback fetch for missing dates
- Add `AND UPPER(campaign_name) LIKE '%APP INSTALLS%'` to all BigQuery queries (daily, campaign, totals, previousTotals)

**BigQuery Query Update Example:**
```sql
WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
  AND UPPER(campaign_name) LIKE '%APP INSTALLS%'
```

### 2. `supabase/functions/meta-preview/index.ts`

**Changes:**
- Add `filterAppInstallCampaigns` helper function  
- Filter the results from `fetchMetaInsights` before returning

### 3. `supabase/functions/meta-to-bigquery/index.ts`

**Changes:**
- Add `filterAppInstallCampaigns` helper function
- Filter the Meta API response before transforming and inserting into BigQuery
- This prevents non-app-install campaigns from ever being stored

---

## Technical Details

### Filter Application Points

```text
meta-to-bigquery (scheduled sync):
  Meta API → Filter → Transform → BigQuery

meta-history (dashboard queries):
  BigQuery (with WHERE filter) → Merge with...
  Live API for today → Filter → Return combined data

meta-preview (data preview):
  Meta API → Filter → Return
```

### Case-Insensitive Matching

The filter uses `toUpperCase()` in JavaScript and `UPPER()` in SQL to ensure case-insensitive matching, so campaigns named "App Installs", "APP INSTALLS", or "app installs" all match.

---

## Expected Results

| Before | After |
|--------|-------|
| All campaigns shown (e.g., Traffic, Awareness, App Installs) | Only "APP INSTALLS" campaigns shown |
| Reporting totals include all spend | Reporting totals reflect only app install spend |
| BigQuery stores all campaigns | BigQuery only stores app install campaigns (future syncs) |

---

## Note on Historical Data

Existing BigQuery data will still contain non-app-install campaigns until those rows are replaced by new syncs. The BigQuery WHERE clause ensures they won't appear in queries regardless.

