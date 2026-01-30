

# Fix: Google Ads Should Query BigQuery for Today's Data

## Problem

The `google-ads-history` function is unnecessarily capping the BigQuery query date range to **yesterday**, even though today's data already exists in BigQuery via Windsor.ai sync.

**Current behavior (line 260):**
```typescript
const bqEndDate = endDate >= today ? yesterday : endDate;
```

This means when a user selects a date range including today:
- BigQuery query only fetches up to yesterday
- The code tries to fetch "today" via live Google Ads API
- Live API fails (developer token not approved)
- Result: today's data is missing, even though it's in BigQuery

## Solution

For Google Ads specifically, **always query BigQuery with the full date range** (including today) since the data is available there. Remove the logic that caps at yesterday and removes the live API fallback.

---

## Files to Modify

**`supabase/functions/google-ads-history/index.ts`**

### Changes:

1. **Remove date capping logic** - Query BigQuery with the actual `startDate` and `endDate` requested
2. **Remove live API fallback** - Since data is in BigQuery, we don't need the Google Ads live API call
3. **Remove `todayDataUnavailable` flag** - Data IS available, so this flag is no longer needed

### Before (lines 255-264):
```typescript
const today = getTodayDate();
const yesterday = addDays(today, -1);
const includestoday = endDate >= today;

const bqEndDate = endDate >= today ? yesterday : endDate;
const bqStartDate = startDate > yesterday ? yesterday : startDate;
const shouldQueryBigQuery = bqStartDate <= bqEndDate;
```

### After:
```typescript
const today = getTodayDate();

// Google Ads data is synced to BigQuery including today - no need to cap
const bqStartDate = startDate;
const bqEndDate = endDate;
const shouldQueryBigQuery = true;  // Always query BigQuery
```

### Also remove:
- Lines 357-362: Live API fetch for today (not needed)
- Lines 394-435: Live data merging logic (not needed)
- The `fetchGoogleAdsLiveData` and `transformLiveData` functions can be kept for potential future use, or removed entirely

---

## Implementation

### Step 1: Simplify date handling
Remove the yesterday capping logic and always use the requested date range for BigQuery.

### Step 2: Remove live API attempt
Since BigQuery has today's data, skip the live Google Ads API call entirely.

### Step 3: Clean up response
Remove `todayDataUnavailable` flag since data is always available via BigQuery.

---

## Expected Result

After this fix:
- User selects Jan 22 - Jan 30 → BigQuery queried for full range → Shows all data including today
- User selects Jan 30 only → BigQuery queried for today → Shows today's data
- No more "Partial data" badge for Google Ads

