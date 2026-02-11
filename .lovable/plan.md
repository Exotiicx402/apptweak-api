

# Allow Custom Time Selection for Slack Daily Report

## Problem
The schedule dropdown only offers 6 hardcoded hourly options (7 AM - 12 PM EST). You want 3:15 PM EST, which isn't available -- and future time changes would hit the same limitation.

## Solution
Replace the fixed dropdown with hour + minute selectors, allowing any time in 15-minute increments.

## Changes

### 1. `src/components/SlackReportControls.tsx`
- Replace the `SCHEDULE_OPTIONS` dropdown with two selectors: **Hour** (1-12) and **Minute** (00, 15, 30, 45) plus an AM/PM toggle
- Convert the selected time to a UTC cron expression (EST is UTC-5, so 3:15 PM EST = `15 20 * * *`)
- Display the current schedule as a human-readable time (e.g., "Daily at 3:15 PM EST")
- Pre-populate the selectors based on the current cron value from the database

### 2. `supabase/functions/manage-schedules/index.ts`
- Update `parseSchedule()` to dynamically convert any cron expression like `M H * * *` into a readable EST time string (e.g., "Daily at 3:15 PM EST") instead of relying on a hardcoded mapping
- This handles arbitrary times without needing to add new entries

### 3. `src/pages/Schedules.tsx`
- No changes needed -- it already accepts arbitrary cron values and displays `scheduleDisplay` from the edge function

## Technical Details

**Time conversion logic (EST to UTC cron):**
```text
User selects: 3:15 PM EST
  -> 15:15 EST
  -> 20:15 UTC
  -> Cron: "15 20 * * *"
```

**Dynamic `parseSchedule` in edge function:**
```text
Input:  "15 20 * * *"
  -> minute=15, hour=20 UTC
  -> 20-5=15 EST -> 3:15 PM
  -> Output: "Daily at 3:15 PM EST"
```

**Minute options:** 00, 15, 30, 45 (quarter-hour increments keep it simple while covering your use case)
