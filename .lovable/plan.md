

# Fix Snapchat Analytics Discrepancy

## Problem Summary

There are two types of discrepancies in Snapchat analytics:

1. **Spend Discrepancy**: For 1/31/2026, the Snapchat platform shows $4,664 but we have $4,068 (~$596 missing)
2. **Install Discrepancy**: Install counts don't match between our system and the platform

## Root Cause Analysis

### Spend Discrepancy

After investigation, the Snapchat API only returns **one campaign** for 1/31. The missing $596 is likely from:
- A second ad account not being synced
- A SKAN-enabled campaign in a different structure
- Archived campaigns that no longer appear in API breakdown responses

### Install Discrepancy  

This is caused by **attribution timing settings**:
- Our sync uses `action_report_time: 'conversion'` (installs credited to conversion day)
- Platform UI may use `impression` time (installs credited to impression day)

---

## Proposed Solution

### Step 1: Add Account-Level Stats Query

Add a new query to fetch **account-level totals** (not broken down by campaign) to verify we're capturing all spend. This serves as a cross-check.

```text
File: supabase/functions/snapchat-to-bigquery/index.ts

Add function:
- fetchAccountLevelStats(accessToken, date)
  - Queries stats at account level without campaign breakdown
  - Returns total spend, impressions, installs
  - Logs comparison with campaign-level totals
```

### Step 2: Add Reconciliation Logging

Modify the sync to log when account-level totals don't match campaign-level totals:

```text
if (accountTotalSpend !== sumOfCampaignSpend) {
  console.warn(`SPEND MISMATCH: Account total $${accountTotalSpend} vs Campaign sum $${sumOfCampaignSpend}`);
  // This indicates missing campaigns in the breakdown
}
```

### Step 3: Support Multiple Ad Accounts (if needed)

If confirmed there are multiple ad accounts:

```text
File: supabase/functions/snapchat-to-bigquery/index.ts

Change:
- SNAPCHAT_AD_ACCOUNT_ID (single value)
To:
- SNAPCHAT_AD_ACCOUNT_IDS (comma-separated list)
- Loop through each account and aggregate data
```

### Step 4: Add Attribution Window Configuration

Make attribution settings visible and configurable for debugging:

```text
File: supabase/functions/snapchat-history/index.ts

Add to response:
{
  attributionSettings: {
    swipe_up_attribution_window: '28_DAY',
    view_attribution_window: '1_DAY', 
    action_report_time: 'conversion'
  }
}
```

---

## Implementation Steps

### Phase 1: Diagnostic Enhancement

1. **Add account-level stats query** to compare against campaign breakdown
2. **Log discrepancies** between account totals and campaign sums
3. **Display attribution settings** in the UI for transparency

### Phase 2: Multi-Account Support (if needed)

4. **Update environment variable** to support multiple ad account IDs
5. **Loop through accounts** during sync
6. **Aggregate data** from all accounts

### Phase 3: Attribution Alignment (optional)

7. **Add option to switch** between conversion and impression time
8. **Document the differences** so users understand why numbers may vary

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/snapchat-to-bigquery/index.ts` | Add account-level verification, multi-account support |
| `supabase/functions/snapchat-history/index.ts` | Add attribution settings to response, add account-level cross-check |
| `supabase/functions/snapchat-preview/index.ts` | Add account-level totals display |

---

## Expected Outcome

After implementation:
1. We'll know if there's a mismatch between account-level spend and campaign-level spend
2. If there are multiple ad accounts, we'll sync all of them
3. Attribution settings will be transparent in the UI
4. Any remaining discrepancies will be clearly identified and logged

---

## Technical Notes

### Account-Level Stats Query

The Snapchat API supports querying at account level without breakdown:
```
GET /v1/adaccounts/{ad_account_id}/stats
?granularity=DAY
&start_time=...
&end_time=...
(without breakdown parameter)
```

This returns totals for the entire account, which should equal the sum of all campaigns.

### Multi-Account Considerations

If syncing multiple accounts:
- Each account may have different timezone settings
- Need to track which account each row came from
- BigQuery table may need an `ad_account_id` column

