

# Update FTD Event Tracking to "Add Payment Info"

## What Changed
The primary Meta conversion event for FTD tracking has moved from `FirstTimeDeposit` to `Add Payment Info`. Two files reference the old event name.

## Changes

### 1. `supabase/functions/ftd-meta-sync/index.ts`
Update the action type constants and matching logic:
- Change `FTD_ACTION_TYPE` to `"add_payment_info"` (Meta's standard event name)
- Change `FTD_ACTION_TYPE_ALT` to `"offsite_conversion.fb_pixel_custom.AddPaymentInfo"` as fallback
- Update the fuzzy match from `"firsttimedeposit"` to `"add_payment_info"` / `"addpaymentinfo"`
- Keep the old `FirstTimeDeposit` types as additional fallbacks so historical data still parses correctly
- Update the debug logging to match the new event names

### 2. `supabase/functions/meta-hours-creatives/index.ts`
- Line 85: Change `"offsite_conversion.fb_pixel_custom.FirstTimeDeposit"` to `"add_payment_info"`

### 3. Redeploy
Both edge functions will be redeployed after the changes.

No database changes needed — the table columns (`ftd_count`, `cost_per_ftd`) stay the same, just the source event name changes.

