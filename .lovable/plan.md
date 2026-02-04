
# Fix Snapchat Preview Attribution Settings

## Problem Identified

The `snapchat-preview` function is using the **old attribution settings**:
- `swipe_up_attribution_window: '28_DAY'` (should be `7_DAY`)
- `action_report_time: 'conversion'` (should be `impression`)

This is why the Raw Data Preview shows 487 installs instead of 216.

---

## Current vs Expected

| Setting | Current (wrong) | Expected (matches platform) |
|---------|-----------------|----------------------------|
| Swipe Window | `28_DAY` | `7_DAY` |
| View Window | `1_DAY` | `1_DAY` |
| Report Time | `conversion` | `impression` |
| Resulting Installs | 487 | 216 |

---

## File to Update

**File:** `supabase/functions/snapchat-preview/index.ts`

**Lines 412-415** - Change attribution settings in `fetchSnapchatStats`:
```typescript
// Before
url.searchParams.set('swipe_up_attribution_window', '28_DAY');
url.searchParams.set('view_attribution_window', '1_DAY');
url.searchParams.set('action_report_time', 'conversion');

// After
url.searchParams.set('swipe_up_attribution_window', '7_DAY');
url.searchParams.set('view_attribution_window', '1_DAY');
url.searchParams.set('action_report_time', 'impression');
```

Also update the comment on line 412:
```typescript
// Before
// Attribution windows: 28-day swipe, 1-day view (matches Snapchat Ads Manager default)

// After
// Attribution windows: 7-day swipe, 1-day view, impression time (matches Snapchat Ads Manager)
```

---

## Summary of All Snapchat Functions

After this fix, all three Snapchat functions will use consistent attribution:

| Function | Swipe | View | Report Time | Status |
|----------|-------|------|-------------|--------|
| `snapchat-history` | 7_DAY | 1_DAY | impression | Already updated |
| `snapchat-to-bigquery` | 7_DAY | 1_DAY | impression | Already updated |
| `snapchat-preview` | 7_DAY | 1_DAY | impression | Needs update |

---

## Expected Outcome

After this update:
- Raw Data Preview will show **216 installs** (matching the diagnostics)
- All Snapchat data will use consistent **7_DAY/1_DAY/impression** attribution
- Numbers will match the Snapchat platform exactly
