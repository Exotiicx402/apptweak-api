

# Update FTD Reporting to Track All HOURS Campaigns with "Adds Payment Info"

## Problem
Two issues visible from the screenshots:
1. **Campaign filter too narrow**: The sync function filters for campaigns containing "FTD" in the name, but only 4 of 6 HOURS campaigns have "FTD" in their name. Campaigns like "HOURS | OSCARS | DEFI | AWARENESS" and "HOURS | DESKTOP ONLY" are excluded.
2. **Terminology**: Everything still says "FTD" but the tracked event is now "Website Adds Payment Info". Labels throughout the UI and Slack report need updating.

## Changes

### 1. Edge Function: `supabase/functions/ftd-meta-sync/index.ts`
- Change `FTD_CAMPAIGN_FRAGMENT` from `"FTD"` to `"HOURS"` so all 6 HOURS campaigns are captured
- Update log messages to reference "HOURS campaigns" instead of "FTD campaigns"

### 2. UI: `src/pages/FTDReporting.tsx`
- Page title: "FTD Campaigns" → "HOURS Campaigns"
- Subtitle: Update to `HOURS · DEFI · WEB`
- KPI labels: "FTD Count" → "Results", "Cost per FTD" → "Cost / Result"
- Chart titles: "FTDs Over Time" → "Results Over Time", "Cost per FTD" → "Cost per Result"
- Table headers: "FTDs" → "Results", "Cost / FTD" → "Cost / Result"
- Empty state text updates

### 3. Slack Report: `supabase/functions/slack-daily-report/index.ts`
- Update `Results (FTDs)` → `Results (API)`
- Update `Avg. FTD Value` → `Avg. Result Value`
- Fix `campaignLabel()` function — currently looks for "INTERNATIONAL" which many HOURS campaigns don't have. Update to extract the distinguishing segment more generically (e.g., parts between "HOURS" and the last segment)

### 4. Redeploy
Both `ftd-meta-sync` and `slack-daily-report` edge functions.

No database changes needed — the `ftd_performance` table columns stay the same, just the filter and labels change.

