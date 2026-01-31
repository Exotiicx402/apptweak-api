
# Add "Today" and "Yesterday" Buttons to Date Range Picker

## Overview

Add two new quick-select buttons ("Today" and "Yesterday") to the date range picker at the top of the reporting page. These buttons will set both the start and end dates to the same single day, allowing users to quickly view metrics for just today or yesterday.

---

## Implementation

### File to Modify

**`src/components/dashboard/DateRangePicker.tsx`**

### Changes

1. Import `getLocalYesterday` from dateUtils (already available in the file)
2. Add two new handler functions for single-day selection:
   - `setToday()` - sets both start and end to today's date
   - `setYesterday()` - sets both start and end to yesterday's date
3. Add two new buttons at the beginning of the preset button row

### Updated Button Row

The buttons will appear in this order:
- **Today** (new)
- **Yesterday** (new)  
- Last 7 days
- Last 14 days
- Last 30 days
- Last 90 days

### Code Changes

```typescript
// Add import for getLocalYesterday
import { getLocalDaysAgo, getLocalToday, getLocalYesterday } from "@/lib/dateUtils";

// Add single-day handlers
const setToday = () => {
  const today = getLocalToday();
  onStartDateChange(today);
  onEndDateChange(today);
};

const setYesterday = () => {
  const yesterday = getLocalYesterday();
  onStartDateChange(yesterday);
  onEndDateChange(yesterday);
};

// New buttons in the flex gap-2 div
<Button variant="outline" size="sm" onClick={setToday} className="text-xs">
  Today
</Button>
<Button variant="outline" size="sm" onClick={setYesterday} className="text-xs">
  Yesterday
</Button>
```

---

## Visual Result

The date picker row will now show:

```
[Today] [Yesterday] [Last 7 days] [Last 14 days] [Last 30 days] [Last 90 days]    Start Date [____]  End Date [____]  [Apply]
```

---

## Notes

- Uses existing `getLocalYesterday` helper from `dateUtils.ts` for consistent timezone handling
- Maintains the same button styling (`variant="outline"`, `size="sm"`, `text-xs`) as other presets
- Single-day selections set both start and end date to the same value, which the backend edge functions already handle correctly
