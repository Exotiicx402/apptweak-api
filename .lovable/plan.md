

## Add Explicit Attribution Window to Meta API Calls

### Problem
The Meta API calls do not specify an `action_attribution_windows` parameter, meaning install counts rely on Meta's account default settings. To guarantee data consistency with Meta Ads Manager reporting, we need to explicitly set the attribution window.

### Solution
Add the `action_attribution_windows` parameter to both Meta edge functions to match your Meta Ads Manager settings (7-day click, 1-day view).

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/meta-preview/index.ts` | Add `action_attribution_windows` parameter |
| `supabase/functions/meta-to-bigquery/index.ts` | Add `action_attribution_windows` parameter |

---

### Implementation Details

**Add this parameter to both functions (after line 48 in meta-preview, after line 98 in meta-to-bigquery):**

```javascript
url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
```

This explicitly tells the Meta API to return conversion data using:
- **7d_click**: Conversions within 7 days of ad click
- **1d_view**: Conversions within 1 day of ad view (impression)

---

### Verification
After deployment, test with the Jan 25-28 date range to confirm:
- Installs: ~818
- Spend: ~$11,909
- CPI: ~$14.56

---

### Technical Notes

The `action_attribution_windows` parameter accepts these values:
- `1d_click`, `7d_click`, `28d_click` - Click attribution windows
- `1d_view`, `7d_view`, `28d_view` - View (impression) attribution windows

Meta Ads Manager typically defaults to `7d_click` and `1d_view`, which is what we will explicitly set to ensure consistency.

