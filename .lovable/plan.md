

# Snapchat Ad-Level Data Verification

## Current Status: ✅ Working

Based on my investigation, the Snapchat ad-level data sync and retrieval is now functioning correctly.

### What's Already Implemented

1. **Sync Function (`snapchat-to-bigquery`)** - Updated to:
   - Use `breakdown=ad` instead of `breakdown=campaign`
   - Fetch ad names and ad squad mappings
   - Store `ad_id` and `ad_name` in BigQuery

2. **History Function (`snapchat-history`)** - Updated with:
   - Ad-level query that returns creative performance data
   - Smart fallback logic: prefers ad-level data, falls back to campaign-level for historical dates
   - Prevents double-counting by using COALESCE with FULL OUTER JOIN

3. **Live API Response for Feb 3rd** shows:
   - **22 ads** with full metrics (spend, installs, CTR, CPI)
   - Correct totals: **$5,000 spend, 219 installs**
   - Previous period (Feb 2nd): **$4,999.72 spend, 435 installs** (campaign-level fallback)

### Data Verification

| Date | Spend | Installs | Ad-Level Records |
|------|-------|----------|------------------|
| Feb 3 | $5,000 | 219 | 22 ads ✅ |
| Feb 2 | $4,999.72 | 435 | 0 (campaign fallback) |

### Why Feb 2nd Has No Ad-Level Data

Feb 2nd data was synced *before* the ad-level granularity was added to the sync function. The system correctly falls back to campaign-level metrics for totals, but the Creative Performance Grid shows "Ad-level creative data is not yet available" for dates without ad granularity.

---

## Optional: Backfill Historical Data

To populate ad-level data for historical dates, we can create a backfill function that re-syncs past dates with the new ad-level logic.

### Technical Approach

1. Create a `snapchat-backfill` edge function that:
   - Accepts a date range (e.g., last 7 days)
   - Iterates through each date
   - Calls the Snapchat API with `breakdown=ad`
   - Merges data into BigQuery

2. Run the backfill once to populate historical ad-level data

### Implementation Details

```text
┌─────────────────────────────────────────────────────────┐
│  snapchat-backfill edge function                        │
├─────────────────────────────────────────────────────────┤
│  Input: { startDate: "2026-01-28", endDate: "2026-02-02" }│
│                                                          │
│  For each date in range:                                │
│    1. Fetch ad names from Snapchat API                  │
│    2. Fetch ad-level stats with breakdown=ad            │
│    3. Transform with ad_id, ad_name, campaign_name      │
│    4. MERGE into BigQuery (upsert by timestamp + ad_id) │
│                                                          │
│  Output: { success: true, datesSynced: 6, rowsAffected: 132 }│
└─────────────────────────────────────────────────────────┘
```

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/snapchat-backfill/index.ts` | Backfill edge function for historical ad-level data |

---

## Summary

The current implementation is complete and working for new data. Going forward:
- **Daily syncs** will capture ad-level data automatically
- **Historical dates** (before the upgrade) will show campaign totals but no creative cards
- **Backfill** (optional) can populate historical creative data

Would you like me to implement the backfill function to populate ad-level data for past dates?

