

# Fix: Moloco, TikTok, and Google Ads Showing 0 for Today

## Problem Summary

When the date range includes **only today** (2026-01-30 to 2026-01-30), these three platforms return 0:

| Platform | Root Cause |
|----------|------------|
| **Google Ads** | Developer Token not approved for production; live API fails with `DEVELOPER_TOKEN_NOT_APPROVED`, and there's no BigQuery data for today |
| **TikTok** | No live API available (data comes from Windsor.ai sync which runs periodically) |
| **Moloco** | Async reporting API has delay; today's data isn't immediately available |

## Current Behavior

When the user selects "Today" as the date range:
1. The functions check if `endDate >= today` 
2. For platforms without live API access, they set `effectiveEndDate = yesterday`
3. Since `startDate (today) > effectiveEndDate (yesterday)`, the query returns nothing
4. Result: 0 for all metrics

## Solution Options

### Option A: Show "Data Unavailable" Message (Recommended)
Instead of showing 0 (which looks like an error), indicate that today's data is not yet available for these platforms.

**Changes:**
- Update `useReportingData.ts` to detect when platforms return 0 due to data unavailability vs. actual 0 spend
- Add a `dataUnavailable: boolean` flag in the response from each affected function
- Display a "Data not yet available" indicator in the UI for these platforms

### Option B: Default to Yesterday's Date Range
Change the default date range to end at yesterday so users see complete data by default.

**Changes:**
- Update `src/pages/Reporting.tsx` to default `endDate` to yesterday
- Users can still manually select today, but they'll see the limitation

### Option C: Fix Google Ads API Access + Document Limitations
For Google Ads, the actual fix would be getting the Developer Token approved. For TikTok and Moloco, document that today's data has a delay.

---

## Recommended Implementation (Option A + B Combined)

### Step 1: Update Edge Functions to Return Availability Flag

**Files to modify:**
- `supabase/functions/google-ads-history/index.ts`
- `supabase/functions/tiktok-history/index.ts`  
- `supabase/functions/moloco-history/index.ts`

Add a `todayDataUnavailable: boolean` flag to the response when:
- The date range includes today
- No live data could be fetched

```typescript
// Example response structure
{
  success: true,
  data: {
    daily: [...],
    totals: {...},
    previousTotals: {...},
    todayDataUnavailable: true,  // NEW FLAG
    unavailableReason: "Data syncs daily; today's data will be available tomorrow"
  }
}
```

### Step 2: Update Reporting Page Default

**File:** `src/pages/Reporting.tsx`

Change default `endDate` from `getLocalToday()` to `getLocalYesterday()` so users see complete data by default.

### Step 3: Update UI to Show Availability Status

**Files to modify:**
- `src/hooks/useReportingData.ts` - Parse the `todayDataUnavailable` flag
- `src/components/reporting/PlatformMetricsRow.tsx` - Show indicator when data is unavailable

Add visual indicator (e.g., tooltip or badge) when a platform's data is unavailable for the selected date range.

---

## Technical Details

### Google Ads - Why Live API Fails

The error log shows:
```
DEVELOPER_TOKEN_NOT_APPROVED - The developer token is only approved for use with test accounts
```

**Long-term fix:** Apply for Basic or Standard access at Google Ads API Center.

**Short-term fix:** Continue using BigQuery data from Windsor.ai (same as TikTok pattern). The current implementation already falls back to BQ data when the API fails, but when querying for only today there's nothing in BQ yet.

### TikTok - No Direct API

TikTok data flows through Windsor.ai which syncs periodically (typically daily for yesterday's data). There's no live API to query.

### Moloco - Async Reporting Delay

Moloco's reporting API is asynchronous - you create a report request, poll for status, then download when ready. Today's data may not be immediately available in their system.

---

## Files to Change

1. **`supabase/functions/google-ads-history/index.ts`**
   - Add `todayDataUnavailable` flag when only today is selected and no data is available

2. **`supabase/functions/tiktok-history/index.ts`**
   - Add `todayDataUnavailable` flag when only today is selected

3. **`supabase/functions/moloco-history/index.ts`**
   - Add `todayDataUnavailable` flag when only today is selected

4. **`src/pages/Reporting.tsx`**
   - Change default `endDate` to `getLocalYesterday()`

5. **`src/hooks/useReportingData.ts`**
   - Parse the new `todayDataUnavailable` flag from responses
   - Add `dataUnavailable` property to `PlatformMetrics` interface

6. **`src/components/reporting/PlatformMetricsRow.tsx`**
   - Show visual indicator when data is not available

