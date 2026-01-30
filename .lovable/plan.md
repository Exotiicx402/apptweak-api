
# Fix: Meta Ads Failing to Load on Reporting Page

## Problem

The Meta Ads data is intermittently failing with "Failed to send a request to the Edge Function". This is caused by **12 parallel API requests** being made when only **6 are needed**.

Currently, `useReportingData.ts` calls each platform endpoint **twice** - once for the current period and once for the previous period. However, all platform endpoints (including `meta-history`) **already calculate and return `previousTotals`** in their response.

This causes:
- Cold start race conditions (edge functions booting up)
- Potential rate limiting
- Unnecessary API load

## Solution

Simplify `useReportingData.ts` to:
1. Make only **6 requests** (one per platform) instead of 12
2. Extract both `totals` and `previousTotals` from each single response
3. Match how `MetaHistoryDashboard` already works correctly

## Changes

### File: `src/hooks/useReportingData.ts`

**Current approach (inefficient):**
```typescript
// 12 parallel requests
const [metaResult, snapchatResult, ..., prevMetaResult, prevSnapchatResult, ...] = 
  await Promise.allSettled([
    invoke("meta-history", { startDate, endDate }),
    // ... 5 more current period calls
    invoke("meta-history", { startDate: previousStart, endDate: previousEnd }),
    // ... 5 more previous period calls
  ]);
```

**New approach (efficient):**
```typescript
// 6 parallel requests - endpoints already return previousTotals
const [metaResult, snapchatResult, unityResult, googleAdsResult, tiktokResult, molocoResult] = 
  await Promise.allSettled([
    invoke("meta-history", { body: { startDate, endDate } }),
    invoke("snapchat-history", { body: { startDate, endDate } }),
    invoke("unity-history", { body: { startDate, endDate } }),
    invoke("google-ads-history", { body: { startDate, endDate } }),
    invoke("tiktok-history", { body: { startDate, endDate } }),
    invoke("moloco-history", { body: { startDate, endDate } }),
  ]);

// Extract both current and previous from single response
const extractMetrics = (result) => {
  const totals = result.data?.totals || {};
  const previousTotals = result.data?.previousTotals || {};
  return {
    spend: totals.spend,
    installs: totals.installs,
    cpi: totals.cpi,
    previousSpend: previousTotals.spend,
    previousInstalls: previousTotals.installs,
    previousCpi: previousTotals.cpi,
  };
};
```

## Result

- **50% fewer API calls** (6 instead of 12)
- Eliminates race conditions from parallel cold starts
- More reliable data loading
- Faster page load time
