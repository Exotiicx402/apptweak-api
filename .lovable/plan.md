

# Fix: Moloco Should Query API for Full Date Range

## Problem

The `moloco-history` function currently caps the API query at yesterday, even though we haven't verified this is actually an API limitation. The code assumes a delay exists and sets `todayDataUnavailable = true` whenever today is in the selected range.

**Current behavior (lines 241-253):**
```typescript
const effectiveEndDate = endDate >= today ? yesterday : endDate;
const todayDataUnavailable = includestoday;
const unavailableReason = includestoday ? "Moloco reports have a delay..." : "";
```

## Solution

Apply the same fix as Google Ads and TikTok:

1. **Remove date capping** - Query Moloco API with the full `startDate` to `endDate` range
2. **Remove `todayDataUnavailable` flag** - Let the API return whatever data it has
3. If today's data isn't available, it simply won't appear in the results (graceful handling)

---

## File to Modify

**`supabase/functions/moloco-history/index.ts`**

### Before (lines 233-253):
```typescript
const today = getTodayDate();
const yesterday = addDays(today, -1);
const includestoday = endDate >= today;

// Moloco reports are typically available with some delay
// Cap end date at yesterday for the API query
const effectiveEndDate = endDate >= today ? yesterday : endDate;
// Adjust start date if it's in the future
const effectiveStartDate = startDate > yesterday ? yesterday : startDate;
// Only skip if the entire range would be invalid
const shouldFetch = effectiveStartDate <= effectiveEndDate;

console.log(`Moloco query: ${effectiveStartDate} to ${effectiveEndDate}, shouldFetch: ${shouldFetch}`);

// Track if today is in range but we have no live API
const todayDataUnavailable = includestoday;
const unavailableReason = includestoday ? "Moloco reports have a delay; today's data will be available tomorrow" : "";
```

### After:
```typescript
// Query Moloco API with the full date range - let API return whatever data is available
const effectiveStartDate = startDate;
const effectiveEndDate = endDate;
const shouldFetch = true;

console.log(`Moloco query: ${effectiveStartDate} to ${effectiveEndDate}`);
```

### Also remove from response (around lines 299-300 and 332-333):
```typescript
todayDataUnavailable,
unavailableReason,
```

---

## Expected Result

After this fix:
- Moloco queries the API for the full date range including today
- If today's data exists in Moloco, it will be returned
- If today's data doesn't exist yet, the results simply won't include it (no error)
- No more "Partial data" badge for Moloco
- Consistent behavior with Google Ads and TikTok

