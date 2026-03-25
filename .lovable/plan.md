

## Add Moloco to the Reporting Dashboard

### What we're building
Adding Moloco as a 5th platform row on the `/reporting` page, displayed alongside Meta, Snapchat, Google Ads, and TikTok. The data shape from `moloco-history` already matches the other platforms (returns `totals` and `previousTotals`), so this is primarily wiring work.

### Changes

**1. `src/hooks/useReportingData.ts`**
- Add `moloco` to the `ReportingData` interface and initial state
- Add a 5th `Promise.allSettled` call to `supabase.functions.invoke("moloco-history", ...)`
- Extract Moloco metrics with the same `extractMetrics` helper
- Include Moloco in the totals calculation

**2. `src/pages/Reporting.tsx`**
- Import `molocoLogo` from `@/assets/logos/moloco.webp`
- Add a `<PlatformMetricsRow>` for Moloco between Google Ads and TikTok (or after TikTok)
- Include `data.moloco?.isLoading` in the `anyPlatformLoading` check

No new components or edge functions needed -- the existing `moloco-history` endpoint and `PlatformMetricsRow` component handle everything.

