

# Fix: Platforms Showing 0 When "Today" Is Included in Date Range

## Problem Identified

When a user selects a date range that includes **today** (e.g., Jan 22 - Jan 30), the TikTok, Google Ads, and Moloco history functions incorrectly return 0 metrics because of flawed date handling logic.

### Root Cause

The current logic in `tiktok-history` and `google-ads-history`:

```text
effectiveEndDate = includestoday ? yesterday : endDate
shouldQueryBigQuery = startDate <= effectiveEndDate
```

When the user selects **only today** as the date range:
- `startDate = 2026-01-30`, `endDate = 2026-01-30`
- `effectiveEndDate` becomes `2026-01-29`
- `shouldQueryBigQuery` = `2026-01-30 <= 2026-01-29` = **FALSE**
- Result: BigQuery query is skipped entirely → 0 metrics returned

**Moloco Issue**: Separate problem - the Moloco API is returning HTTP 429 (rate limit exceeded). This is a quota issue with the Moloco API, not a code bug.

## Solution

### 1. Fix TikTok History Function

Update the logic to **always query BigQuery** when there's historical data available, even if "today" is part of the range:

```text
Current (broken):
  effectiveEndDate = yesterday if today included
  skip BQ query if startDate > effectiveEndDate

Fixed:
  bqEndDate = min(endDate, yesterday)  -- cap at yesterday
  bqStartDate = startDate
  skip BQ query ONLY if bqStartDate > bqEndDate
```

**Key Changes:**
- Remove the premature return when only "today" is selected
- Instead, query BigQuery with the available date range (capped at yesterday)
- Show data for the days we have, set `todayDataUnavailable` flag only when today is specifically requested

### 2. Fix Google Ads History Function

Same logic fix - the current `shouldQueryBigQuery` check is too aggressive.

### 3. Fix Moloco History Function

Two changes needed:
- Apply the same date range fix as TikTok/Google Ads
- Add retry logic or reduce concurrent API calls to avoid rate limiting

---

## Technical Details

### Files to Modify

**1. `supabase/functions/tiktok-history/index.ts`**

Lines 130-161 need to be updated:

```typescript
// BEFORE (lines 130-136)
const today = getTodayDate();
const includestoday = endDate >= today;
const effectiveEndDate = includestoday ? addDays(today, -1) : endDate;
const shouldQueryBigQuery = startDate <= effectiveEndDate;

// AFTER
const today = getTodayDate();
const yesterday = addDays(today, -1);
const includestoday = endDate >= today;

// Cap end date at yesterday for BQ query, but don't skip if start is also recent
const bqEndDate = endDate >= today ? yesterday : endDate;
const bqStartDate = startDate;

// Only skip if the entire range is in the future (which shouldn't happen)
// or if start > yesterday AND we're only asking for today
const shouldQueryBigQuery = bqStartDate <= bqEndDate;
```

Also fix the edge case at lines 143-161 to not return early with empty data, but instead continue to query BQ for whatever historical range is available.

**2. `supabase/functions/google-ads-history/index.ts`**

Similar fix at lines 255-258:
- Change `bqEndDate` calculation to cap at yesterday properly
- Ensure BigQuery query runs for historical dates even when "today" is in the range

**3. `supabase/functions/moloco-history/index.ts`**

Two fixes:
- Apply same date range logic fix
- **Rate limiting**: The Moloco API has a quota limit. Options:
  - Add exponential backoff/retry on 429 errors
  - Cache the access token longer
  - Reduce concurrent requests (don't fetch both periods in parallel)

---

## Expected Behavior After Fix

| User Selects | What Happens | Result |
|--------------|--------------|--------|
| Jan 22 - Jan 29 | Query BQ for full range | ✅ Shows data |
| Jan 22 - Jan 30 | Query BQ for Jan 22-29, flag today unavailable | ✅ Shows data + "partial" badge |
| Jan 30 only | Query BQ returns empty (no data for today), flag today unavailable | ✅ Shows message "today's data not yet available" |

---

## Implementation Steps

1. Update `tiktok-history` - fix date range logic
2. Update `google-ads-history` - fix date range logic  
3. Update `moloco-history` - fix date range logic + add retry for rate limits
4. Deploy all three functions
5. Test with date ranges including today

