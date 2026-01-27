
## What’s actually happening (root cause)

### 1) The “ASC downloads” backend function doesn’t exist right now
Evidence from the current project state:
- Calling the backend function directly returns **404 NOT_FOUND** (“Requested function was not found”).
- `supabase/functions/` **does not contain** an `asc-downloads/` folder.
- `supabase/config.toml` **does not include** a `[functions.asc-downloads]` entry.
- The frontend also has **no ASC hook/component** right now (`useASCDownloads` / `ASCDownloadsChart` don’t exist and there are no “App Store Connect” references in `src/`).

So any attempt to fetch ASC downloads will fail because there’s nothing deployed for `asc-downloads`.

### 2) Separately: AppsFlyer is hitting a hard quota and returning 403
In the dashboard network requests we can see:
- `appsflyer-ssot` returns **403** with: `Limit reached for daily-report`

This can cause “something went wrong/internal error” style messages depending on how/where it’s surfaced, and it also spams the console every refetch.

## What we’ll change (high level)
1) Re-add the missing “ASC Downloads” backend function + register it so it deploys.
2) Add the missing frontend pieces (hook + chart) and insert the chart on the dashboard.
3) Reduce noisy/repeating “internal error” symptoms from AppsFlyer quota limits (so the dashboard stays clean and stable).

---

## Implementation plan

### A. Restore the missing ASC backend function (so it stops 404’ing)
**A1. Create** `supabase/functions/asc-downloads/index.ts`
- Read secrets from environment:
  - `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY`
- Implement ES256 JWT generation using Web Crypto:
  - Convert `.p8` PEM to PKCS8 DER
  - `crypto.subtle.importKey` with `ECDSA` + `P-256`
  - Sign `base64url(header).base64url(payload)` and base64url-encode raw signature (r||s)
- Implement App Store Connect “Analytics Reports” flow:
  - Ensure a report request exists for the app (create `accessType: ongoing` if needed).
  - Discover available reports and select the one that matches downloads (usually “App Units” / similar).
  - Fetch the most recent daily instance(s), list segments, download the segment file(s).
  - Decompress the downloaded file (Apple commonly serves ZIP) and parse TSV/CSV.
  - Aggregate into `{ downloads: [{ date, downloads }] }` for the last 7 days.
- Add clear logging and return structured errors (with enough detail to debug, but no secrets).

**A2. Register the function**
- Update `supabase/config.toml` to include:
  - `[functions.asc-downloads]`
  - `verify_jwt = false`

**A3. Quick deploy verification**
- Call the function from the backend test tool after changes land to confirm:
  - It exists (no more 404)
  - It returns JSON in the expected shape
  - If Apple returns “report not ready”, we return a user-friendly error (not a generic “internal error”).

---

### B. Add the missing ASC frontend integration (hook + chart + dashboard placement)
**B1. Create** `src/hooks/useASCDownloads.ts`
- Use the existing rolling date pattern (`getRollingRange`)
- Default to last 7 days, but offset the end date by 1–2 days (ASC typically lags)
- Use `supabase.functions.invoke("asc-downloads", { body: { appId, startDate, endDate } })`
- Normalize dates to exactly 7/8 points (same as other charts)
- If the backend responds “report not ready”, expose it as a friendly “data delayed” state.

**B2. Create** `src/components/ASCDownloadsChart.tsx`
- Match styling of `DownloadsHistoryChart` / `AppsFlyerDownloadsChart`
- Show:
  - Title: “Polymarket – Downloads (Last 7 Days)”
  - Badges: “App Store Connect”, “Official”
  - Total + Avg per day
- Provide a clear empty/error message:
  - “Apple reports can lag 24–48h; try again tomorrow” when relevant.

**B3. Update** `src/components/Dashboard.tsx`
- Insert the ASC section between AppTweak and AppsFlyer:
  ```text
  AppTweak Data
  App Store Connect (Official)   <-- new
  AppsFlyer SSOT
  ```
- Add `queryClient.invalidateQueries({ queryKey: ["asc-downloads"] })` to refresh handler.

---

### C. Stop the repeating “internal error” noise caused by AppsFlyer quota (recommended)
Right now `appsflyer-ssot` is returning `403 Limit reached for daily-report`, which is expected under quota pressure.

We’ll make the dashboard resilient by doing one (or both) of the following:

**Option C1 (smallest change): Reduce automatic refetching**
- Update `useAppsFlyerDownloads` to avoid refetching every 5 minutes (or implement a long backoff when the last attempt returned 403).
- This prevents repeatedly hammering the endpoint and producing recurring errors.

**Option C2 (better): Cache AppsFlyer results server-side**
- Modify the backend function `appsflyer-ssot` to store successful daily results into the database (similar to how `apptweak-metrics-history` caches).
- When quota is hit, return cached results instead of an error.

---

## Acceptance criteria (what you’ll see when it’s fixed)
- The dashboard shows a new “App Store Connect” downloads chart.
- The `asc-downloads` backend call no longer returns 404.
- If Apple data is delayed/unavailable, the UI shows a clear “data delayed” message instead of “internal error”.
- AppsFlyer 403 “limit reached” stops spamming/interrupting the experience (either by reduced refetching or caching).

## Notes / risks
- Apple Analytics reports aren’t “instant”: first-time report creation + data availability can take time.
- The downloaded report files are frequently zipped; we’ll include decompression logic in the backend function.
- Report names can vary; we’ll implement discovery + fallback matching and log the available report names once for quick adjustment.
