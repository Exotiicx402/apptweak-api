
# Add Cumulative Performance Report to Slack

## Overview
Create a second Slack report that sends cumulative totals from the campaign launch date (Feb 18, 2026) through yesterday. The existing daily report stays untouched. The new report will be schedulable with a customizable time (default 12:16 PM PST / 3:16 PM EST).

## What stays the same
- The existing daily report edge function, schedule, and UI controls -- no changes at all.

## New Edge Function: `slack-cumulative-report`

A new edge function that:
1. Auto-syncs FTD data from Meta (same pattern as daily report) for the full date range (Feb 18 to yesterday).
2. Queries `ftd_performance` for ALL rows from `2026-02-18` through yesterday (using `gte`/`lte` filters instead of `eq`).
3. Aggregates totals per campaign and overall across the entire date range.
4. Builds a Slack message with the same formatting style as the daily report but:
   - Header: "Cumulative Performance Report - Feb 18 to {yesterday}"
   - Column headers: "Metric" and "Total" (no comparison column since this is lifetime cumulative)
   - Per-campaign sections (WORLD, TIER ONE) and TOTAL section
   - Same 6 metrics: Spend, FTDs, Cost/FTD, Results Value, ROAS, Avg FTD Value
5. Supports `preview: true` mode for the dashboard preview.
6. Sends to the same Slack channel (`C0AED2ECQSZ`).

## New Cron Schedule

Create a cron job for `slack-cumulative-report` defaulting to 12:16 PM PST (= 3:16 PM EST = 20:16 UTC), so cron: `16 20 * * *`.

## UI Updates: `SlackReportControls.tsx`

Add a second card/section below the existing daily report controls:
- Title: "Slack Cumulative Report"
- Description: "Cumulative performance since campaign launch (Feb 18)"
- Same time picker UI (Hour / Minute / AM|PM) mapped to the cumulative report's cron schedule
- Active/Paused toggle
- Manual Preview and Send buttons (calling `slack-cumulative-report`)
- Preview display using a simplified version of `ReportPreview` (no comparison column)

## Technical Details

### New file: `supabase/functions/slack-cumulative-report/index.ts`
- Reuses helper functions (formatCurrency, formatNumber, campaignLabel, etc.)
- New `fetchFTDDataRange(supabase, startDate, endDate)` function that queries with `.gte('date', startDate).lte('date', endDate)` and aggregates across all dates
- `buildCumulativeSlackMessage()` with two-column layout (Metric | Total) instead of three columns
- Auto-syncs Meta data for recent dates before querying
- Campaign launch date `2026-02-18` hardcoded as a constant

### Config: `supabase/config.toml`
- Add `[functions.slack-cumulative-report]` with `verify_jwt = false`

### Cron job
- SQL insert via pg_cron for the cumulative report schedule

### `SlackReportControls.tsx`
- Add a second schedule lookup for the cumulative report cron job
- Duplicate the time picker and toggle controls for the second schedule
- Add preview/send buttons that invoke `slack-cumulative-report`
- Simplified preview component without comparison columns for cumulative data
