

# Fix: TikTok Should Query BigQuery for Today's Data (Same as Google Ads)

## Problem

The `tiktok-history` function is still showing "Partial data" because:

1. **Line 136**: Caps the BigQuery query end date at yesterday
   ```typescript
   const bqEndDate = endDate >= today ? yesterday : endDate;
   ```

2. **Lines 145-146**: Always sets `todayDataUnavailable = true` when today is in the range
   ```typescript
   const todayDataUnavailable = includestoday;
   const unavailableReason = includestoday ? "TikTok data syncs daily; today's data will be available tomorrow" : "";
   ```

Since TikTok data is synced to BigQuery via Windsor.ai (same as Google Ads) and **today's data is already available**, we should apply the same fix.

---

## Solution

Apply the identical fix from Google Ads to TikTok:

1. **Remove date capping** - Query BigQuery with the full `startDate` to `endDate` range
2. **Remove `todayDataUnavailable` flag** - Data IS available in BigQuery

---

## File to Modify

**`supabase/functions/tiktok-history/index.ts`**

### Before (lines 130-146):
```typescript
const today = getTodayDate();
const yesterday = addDays(today, -1);
const includestoday = endDate >= today;

// For TikTok, we only query BQ data (no live API available)
// Cap end date at yesterday for BQ query
const bqEndDate = endDate >= today ? yesterday : endDate;
// Adjust start date if it's in the future (shouldn't happen but handle gracefully)
const bqStartDate = startDate > yesterday ? yesterday : startDate;
// Only skip if the entire range would be invalid
const shouldQueryBigQuery = bqStartDate <= bqEndDate;

console.log(`Query range: ${startDate} to ${endDate}, BQ query: ${bqStartDate} to ${bqEndDate}, shouldQuery: ${shouldQueryBigQuery}`);

// Track if today is in range but we have no live API
const todayDataUnavailable = includestoday;
const unavailableReason = includestoday ? "TikTok data syncs daily; today's data will be available tomorrow" : "";
```

### After:
```typescript
// TikTok data is synced to BigQuery including today via Windsor.ai - no need to cap
const bqStartDate = startDate;
const bqEndDate = endDate;
const shouldQueryBigQuery = true;

console.log(`Query range: ${startDate} to ${endDate}, querying BigQuery for full range`);
```

### Also remove from response (lines 273-274):
```typescript
todayDataUnavailable,
unavailableReason,
```

---

## Expected Result

After this fix:
- TikTok queries BigQuery for the full date range including today
- No more "Partial data" badge for TikTok
- Consistent behavior with the updated Google Ads function

