

## Fix: Meta Creatives Not Showing in /reporting

### Root Cause

The `fetchMetaAdInsights` function in `meta-history/index.ts` fetches ad-level data from the live Meta API **without pagination**. Meta's default API limit is 25 records. With 25 ads returned, none happen to be from "APP INSTALLS" campaigns, so the `filterAppInstallCampaigns` filter drops all of them.

The campaign-level fetch works fine (2 out of 9 campaigns match), but the ad-level fetch misses the relevant ads because they fall outside the first page.

### Evidence from logs
```
Live ad fallback for 2026-03-18: filtered to 0 ads from 25 total
Live ad fallback aggregated 0 unique ads
```
25 is exactly Meta's default page size — confirming the pagination gap.

### Fix

**File: `supabase/functions/meta-history/index.ts`**

Update `fetchMetaAdInsights` to:
1. Add `limit=500` to the API request params
2. Add cursor-based pagination (follow `data.paging.next`) to fetch all ads, not just the first 25
3. This matches the pattern already used in `meta-hours-creatives/index.ts` which paginates correctly

The fix is isolated to the `fetchMetaAdInsights` function (~lines 172-222). No frontend changes needed.

### Technical Detail

```text
Current flow:
  fetchMetaAdInsights(date)
    → single API call, default limit=25
    → returns 25 ads (none from APP INSTALLS campaigns)
    → filterAppInstallCampaigns → 0 results

Fixed flow:
  fetchMetaAdInsights(date)
    → API call with limit=500
    → paginate via paging.next until all ads fetched
    → returns ALL ads
    → filterAppInstallCampaigns → correct results
```

