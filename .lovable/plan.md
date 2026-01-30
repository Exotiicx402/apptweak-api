

# Fix: Reporting Page Shows 0 for Today's Data

## Problem Summary

The Reporting page shows 0 metrics for Meta (and potentially other platforms) when the date range includes **today**. This happens because:

1. **Reporting page** queries **BigQuery** via `meta-history` edge function
2. **Scheduled sync** (every 15 min) only syncs **yesterday's** data by default
3. **Today's data** is only in BigQuery if someone manually clicked "Sync Today" on the Meta Sync page
4. **Meta Sync page "Preview Today"** works because it calls `meta-preview` which queries the **live Meta API**

The user expects consistent data - if the Meta Sync page shows today's data, the Reporting page should too.

## Solution

The cleanest approach is to have the Reporting page query the **live API** for today's data (same as meta-preview does), while continuing to use BigQuery for historical dates. This avoids extra manual sync steps and matches user expectations.

### Implementation Approach

Create a new edge function or modify `meta-history` to:
1. Check if `endDate` includes **today**
2. For today's data: call Meta API directly (like `meta-preview`)
3. For historical data: query BigQuery as usual  
4. Combine the results

This pattern should be applied to all platforms for consistency.

---

## Technical Details

### Files to Modify

**1. supabase/functions/meta-history/index.ts**

Add logic to detect if today is within the date range and fetch from Meta API directly for that day:

```text
Current Flow:
  meta-history → BigQuery only

New Flow:
  meta-history
    ├── For dates < today → Query BigQuery
    └── For today → Call Meta API directly
    └── Combine results
```

Key changes:
- Import same Meta API fetch logic from `meta-preview`
- At the start of the function, check if `endDate >= today`
- If today is included, make a parallel call to fetch today's data from Meta API
- Merge today's data into the BigQuery results before returning

**2. Apply same pattern to other platforms**

Modify these edge functions similarly:
- `supabase/functions/snapchat-history/index.ts` 
- `supabase/functions/unity-history/index.ts`
- `supabase/functions/google-ads-history/index.ts`
- `supabase/functions/tiktok-history/index.ts`
- `supabase/functions/moloco-history/index.ts`

---

## Implementation Steps

1. **Update `meta-history` edge function**:
   - Add `fetchMetaInsights()` function (copy from meta-preview)
   - Add helper to check if today is in date range
   - Modify query logic to:
     - Query BigQuery for dates before today
     - Call Meta API for today's data
     - Combine into unified response

2. **Test the meta-history changes**:
   - Query with date range ending yesterday → should use BigQuery only
   - Query with date range including today → should include live Meta data

3. **Apply same pattern to other platform-history functions** (if they have the same issue)

---

## Alternative Considered

**Change default date range to end at "yesterday"**: 
- Simpler but doesn't solve the core issue
- Users would still get 0 if they manually select today
- Creates inconsistency with Meta Sync page which CAN show today's data

The proposed solution provides a better user experience by making data consistently available regardless of which page is used.

