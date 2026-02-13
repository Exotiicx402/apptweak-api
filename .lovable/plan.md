

## Add Manual Override for Google Ads – Feb 12

Add a new entry to the existing `MANUAL_OVERRIDES` map in the `google-ads-history` edge function for February 12th with the values from the screenshot.

### Values

- **Date:** 2026-02-12
- **Spend:** $444.00
- **Installs:** 49
- **CPI:** $9.06 (444 / 49)

### What changes

**File: `supabase/functions/google-ads-history/index.ts`**

Add one line to the `MANUAL_OVERRIDES` constant:

```
"2026-02-12": { spend: 444.00, installs: 49, cpi: 9.06 }
```

No other changes needed -- the existing override application logic already handles multi-day ranges and single-day queries.

