

# Fix: Moloco Creatives Still Failing with 429 Rate Limit

## Problem

The Moloco creative grid shows "Edge Function returned a non-2xx status code" because:

1. **Concurrent API calls exhaust quota** — When the reporting page loads, two separate edge function invocations fire simultaneously:
   - KPI summary (`skipAds: true` is NOT set in the non-skipAds path) — this can make **up to 3 Moloco API report calls** (current period live, previous period live, plus auth tokens)
   - Creative grid (`adsOnly: true`) — makes **another report call** for ad-group data

   All hit the Moloco API at the same time. With auth + report creation + polling, a single page load can easily trigger 20+ API calls in seconds.

2. **The `adsOnly` path returns HTTP 503 on any error** (line 866-869), which the Supabase client surfaces as "non-2xx status code" to the UI.

## Solution

Serialize Moloco API calls and add retry logic for 429 errors.

### 1. Add retry-with-backoff to `createReport` (~10 lines)

In `supabase/functions/moloco-history/index.ts`, wrap the `createReport` function's fetch call with a retry loop (3 attempts, exponential backoff starting at 5 seconds). This handles transient 429s gracefully instead of immediately failing.

### 2. Serialize KPI and creative fetches on the frontend

In `src/hooks/useMultiPlatformCreatives.ts`, change Moloco's `fetchPlatform` call to run **after** the Meta fetch completes (or add a small delay), so the KPI and creative Moloco calls don't overlap. Alternatively, sequence them:

```
fetchAllPlatforms:
  1. Meta + Moloco KPI (parallel, since Meta doesn't share quota)
  2. Wait for Moloco KPI to finish
  3. Then fetch Moloco creatives (adsOnly)
```

### 3. Return 200 with empty ads on 429 instead of 503

In the `adsOnly` error handler (line 863-870), return a 200 with `success: true` and an empty `ads` array plus a `warning` field, so the UI shows "no creatives" instead of a hard error. The UI can display the warning as a toast.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/moloco-history/index.ts` | Add retry logic to `createReport`; return 200 with warning on 429 in `adsOnly` path |
| `src/hooks/useMultiPlatformCreatives.ts` | Serialize Moloco creative fetch after KPI fetch to avoid concurrent quota usage |

