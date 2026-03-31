

# Use Moloco Native "Actions" for Registrations Instead of AppsFlyer

## Problem

Moloco's API already returns `conversions` (shown as "Action" in their dashboard — 266 in your screenshot). The edge function correctly parses this into `registrations` on line 398. However, lines 1147-1148 then **overwrite** those values with AppsFlyer `af_complete_registration` data, discarding the native Moloco numbers.

## Solution

Stop overwriting Moloco's native `registrations` with AppsFlyer data. Keep the AppsFlyer merge only for `ftds`.

### File: `supabase/functions/moloco-history/index.ts`

1. **Remove the AppsFlyer registrations fetch calls** (lines 1134-1141) — delete the two `fetchAppsFlyerRegistrations` promises from the `Promise.all`
2. **Remove the AppsFlyer registrations merge calls** (lines 1147-1148) — delete `mergeAppsFlyerEvents(mergedRows, currentRegs, 'registrations')` and the previous-period equivalent
3. Keep FTD merging from AppsFlyer unchanged since Moloco's `target_actions` may not map to FTDs the same way

This means registrations will come directly from Moloco's `conversions` metric (the "Action" column you see in the Moloco dashboard), and FTDs will continue to come from AppsFlyer's `first_time_deposit` events.

