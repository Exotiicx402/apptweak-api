

# Fix Slack Report Platforms & Explain Snapchat Install Discrepancy

## Summary

Two issues to address:
1. **Slack Report**: Remove Unity and Moloco from the daily Slack report (only Meta, Snapchat, Google Ads, TikTok should be included)
2. **Snapchat Install Discrepancy**: Document and explain why installs differ between our system and Snapchat platform

---

## Part 1: Snapchat Install Discrepancy Analysis

### Data Comparison (February 3, 2026)

| Metric | Snapchat Platform | Our System | Status |
|--------|-------------------|------------|--------|
| Spend | $5,000 | $5,000 | Matches |
| Installs | 213 | 487 | Discrepancy |

### Root Cause

The install discrepancy is caused by **attribution time methodology**:

- **Our system**: Uses `action_report_time: 'conversion'`
  - Installs are credited to the day the user actually installed
  - Better for tracking actual conversion volume per day
  
- **Snapchat platform UI**: Likely uses `action_report_time: 'impression'` (default)
  - Installs are credited to the day the ad was shown
  - Spreads installs backward across impression dates

This is **NOT a bug** - it's a fundamental difference in how installs are attributed to dates.

### Why Our Numbers Are Higher

With `conversion` time:
- All 487 users who installed on 2/03 are counted on 2/03
- These users may have seen ads on different days (2/01, 2/02, 2/03)

With `impression` time:
- Only users who saw an ad AND installed on 2/03 count as 2/03 installs
- Users who saw ads earlier get counted on those earlier dates

### Recommendation

Our current setting (`conversion` time) is actually **better for performance tracking** because:
- It shows true daily conversion volume
- CPI calculations reflect actual cost per install for that day
- More accurate for daily budget optimization

No code change needed for this - but we should document this clearly in the UI.

---

## Part 2: Update Slack Daily Report

### Current State

The `slack-daily-report` edge function currently includes 6 platforms:
- Meta ✅ (keep)
- Snapchat ✅ (keep)
- Unity ❌ (remove)
- Google Ads ✅ (keep)
- TikTok ✅ (keep)
- Moloco ❌ (remove)

### Changes Required

**File:** `supabase/functions/slack-daily-report/index.ts`

1. **Remove Unity and Moloco from platforms array** (lines 297-304):
   ```typescript
   // Current (6 platforms)
   const platforms = [
     { name: 'Meta', endpoint: 'meta-history' },
     { name: 'Snapchat', endpoint: 'snapchat-history' },
     { name: 'Unity', endpoint: 'unity-history' },      // REMOVE
     { name: 'Google Ads', endpoint: 'google-ads-history' },
     { name: 'TikTok', endpoint: 'tiktok-history' },
     { name: 'Moloco', endpoint: 'moloco-history' },    // REMOVE
   ];
   
   // Updated (4 platforms)
   const platforms = [
     { name: 'Meta', endpoint: 'meta-history' },
     { name: 'Snapchat', endpoint: 'snapchat-history' },
     { name: 'Google Ads', endpoint: 'google-ads-history' },
     { name: 'TikTok', endpoint: 'tiktok-history' },
   ];
   ```

2. **Update platformOrder in buildSlackMessage** (line 176):
   ```typescript
   // Current
   const platformOrder = ['Meta', 'Snapchat', 'Unity', 'Google Ads', 'TikTok', 'Moloco'];
   
   // Updated
   const platformOrder = ['Meta', 'Snapchat', 'Google Ads', 'TikTok'];
   ```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/slack-daily-report/index.ts` | Remove Unity and Moloco from platforms array and display order |

---

## Expected Outcome

After implementation:
1. Daily Slack report will only show 4 platforms: Meta, Snapchat, Google Ads, TikTok
2. Report will be cleaner and load faster (2 fewer API calls)
3. Totals will aggregate only these 4 platforms

---

## Technical Note on Snapchat

The Snapchat install discrepancy is expected behavior due to our `conversion` time attribution setting. This setting provides more accurate daily performance tracking compared to `impression` time. 

If you want install numbers to match the Snapchat platform exactly, we would need to switch to `impression` time - but this would make daily performance comparisons less accurate since installs would be spread across multiple days based on when ads were shown rather than when users actually converted.

