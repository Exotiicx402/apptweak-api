
# Plan: Add Period-over-Period Percentage Changes

This adds percentage change indicators to both the Slack daily report and the Reporting page, showing how each metric (Spend, Installs, CPI) changed compared to the previous equivalent period.

## Overview

For a 1-day report (e.g., Jan 29), it compares against the previous day (Jan 28). For a 7-day range, it compares against the 7 days before that.

---

## Changes

### 1. Update Moloco Endpoint for Previous Period Support

The `moloco-history` endpoint currently doesn't return previous period data. Update it to:
- Calculate the previous date range (same logic as other platforms)
- Make a second API call for the previous period
- Return `previousTotals` alongside `totals`

### 2. Enhance the Slack Daily Report

Update `slack-daily-report` to:
- Fetch data for both yesterday AND the day before yesterday
- Calculate percentage change for each metric per platform
- Add a "% Change" column to the table or show delta below each value
- Use visual indicators (arrows or +/- prefixes)

**Updated Slack message format:**
```text
Platform         Spend        Installs      CPI
--------------------------------------------
Meta             $12,450      3,200         $3.89
                 +8.2%        +12.5%        -3.8%
Snapchat         $8,320       2,150         $3.87
                 -2.1%        +5.3%         -7.0%
...
```

### 3. Update the Reporting Page Components

**useReportingData hook:**
- Extend `PlatformMetrics` interface to include `previousSpend`, `previousInstalls`, `previousCpi`
- Extract `previousTotals` from API responses during processing
- Calculate and store both current and previous values

**PlatformMetricsRow component:**
- Add percentage change display below each metric value
- Show green up arrow for increases, red down arrow for decreases
- Display the change percentage (e.g., "+12.5%" or "-3.8%")
- Consider that CPI increases are typically "bad" (red), decreases are "good" (green)

**TotalMetricsSection component:**
- Same treatment for the totals row - show blended previous period comparison

---

## Technical Details

### Percentage Calculation Logic
```typescript
const calculateChange = (current: number, previous: number): { percent: number; direction: 'up' | 'down' | 'neutral' } => {
  if (previous === 0) return { percent: 0, direction: 'neutral' };
  const change = ((current - previous) / previous) * 100;
  return {
    percent: Math.abs(change),
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
  };
};
```

### Color Coding
- **Spend**: Up = red (more cost), Down = green (savings)
- **Installs**: Up = green (growth), Down = red (decline)
- **CPI**: Up = red (less efficient), Down = green (more efficient)

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/moloco-history/index.ts` | Add previous period fetch and `previousTotals` |
| `supabase/functions/slack-daily-report/index.ts` | Fetch previous day, add % change to message |
| `src/hooks/useReportingData.ts` | Extract and store `previousTotals` per platform |
| `src/components/reporting/PlatformMetricsRow.tsx` | Display % change with arrows |
| `src/components/reporting/TotalMetricsSection.tsx` | Display % change for totals |

---

## Result

**Slack Report** will show:
```
Platform         Spend        Installs      CPI
--------------------------------------------
Meta             $12,450      3,200         $3.89
                 +8.2%        +12.5%        -3.8%
...
TOTAL            $36,470      9,700         $3.76
                 +5.1%        +8.2%         -2.9%
```

**Reporting Page** will show each metric card with a small percentage indicator below the value, similar to the existing `MetricKpiCard` component's change display.
