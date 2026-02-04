

# Remove Unity and Moloco from Reporting Page

## Overview

Remove Unity and Moloco platforms from the client-facing reporting page. These platforms will no longer be displayed in the UI or fetched during data loading.

---

## Changes Required

### 1. Update Reporting Page UI

**File:** `src/pages/Reporting.tsx`

Remove:
- Unity logo import (line 12)
- Moloco logo import (line 15)
- Unity from `anyPlatformLoading` check (line 29)
- Moloco from `anyPlatformLoading` check (line 32)
- Unity `PlatformMetricsRow` component (lines 106-117)
- Moloco `PlatformMetricsRow` component (lines 149-162)
- Update empty state text to list only 4 platforms (line 171)

### 2. Update Data Hook

**File:** `src/hooks/useReportingData.ts`

Remove:
- `unity` and `moloco` from `ReportingData` interface (lines 20, 23)
- `unity` and `moloco` from initial state (lines 49, 52)
- `unity` and `moloco` from loading state setter (lines 65, 68)
- Unity and Moloco API calls from `Promise.allSettled` (lines 76, 79)
- Unity and Moloco metrics extraction (lines 119, 122)
- Unity and Moloco from platforms array for totals calculation (line 125)
- Unity and Moloco from final state update (lines 139, 142)

---

## Summary

| File | Action |
|------|--------|
| `src/pages/Reporting.tsx` | Remove Unity and Moloco UI components and imports |
| `src/hooks/useReportingData.ts` | Remove Unity and Moloco data fetching and state |

---

## Result

After this change:
- The reporting page will show 4 platforms: Meta, Snapchat, Google Ads, TikTok
- Total metrics will aggregate only these 4 platforms
- 2 fewer API calls will be made (4 instead of 6)
- Page will load slightly faster

