

## Plan: Add `overallTotals` to creative-insights API

### Problem Identified

You're correct that within the `creative-insights` API, the individual creative spend/installs **do match** the reported totals. I verified this:

| Platform | Individual Sum | API Total | Match? |
|----------|----------------|-----------|--------|
| Meta | $126,304.66 | $126,304.66 | ✅ |
| Snapchat | $182,825.37 | $182,825.37 | ✅ |
| Google | $81,634.22 | $81,634.22 | ✅ |
| TikTok | $80,766.04 | $80,766.04 | ✅ |

However, the AI agent is comparing these to **overall platform spend**, which is much higher (especially for Google Ads):

| Platform | creative-insights | Dashboard Total | Gap |
|----------|-------------------|-----------------|-----|
| Google Ads | $81,634 | $1,163,222 | **$1,081,588** (93% missing) |
| Meta | $126,305 | $126,305 | ~$0 |
| Snapchat | $182,825 | $182,825 | ~$0 |
| TikTok | $80,766 | $80,766 | ~$0 |

### Root Cause

The `creative-insights` API filters with `WHERE ad_name IS NOT NULL AND ad_name != ''`, which excludes:
- Campaign-level spend without asset breakdowns
- Rows where the ad/asset name was not synced

For Google Ads specifically, **93% of spend** doesn't have an `asset_name` in BigQuery because Windsor.ai syncs at campaign level for most rows.

---

### Solution: Add `overallTotals` Section

Add a separate section to the response that shows total platform spend **without the ad_name filter**, giving AI agents both perspectives:

```json
{
  "totals": {
    "spend": 471530.29,        // Creative-level only (sums correctly)
    "installs": 31875
  },
  "overallTotals": {
    "spend": 1553118.00,       // Full campaign spend
    "installs": 109630,
    "note": "Includes spend without ad-level attribution"
  },
  "creatives": [...]
}
```

---

### Technical Changes

**File: `supabase/functions/creative-insights/index.ts`**

1. Add new platform total fetcher functions that query BigQuery **without the ad_name filter**:

```typescript
async function fetchPlatformTotals(
  startDate: string, 
  endDate: string, 
  accessToken: string
): Promise<{ platform: string; spend: number; installs: number }[]> {
  // Query each platform's BQ table for totals WITHOUT ad_name filter
  // Similar to existing history endpoints
}
```

2. Call this in parallel with creative fetchers (minimal latency impact)

3. Add `overallTotals` to response:
```typescript
overallTotals: {
  spend: platformTotals.reduce((sum, p) => sum + p.spend, 0),
  installs: platformTotals.reduce((sum, p) => sum + p.installs, 0),
  byPlatform: platformTotals
}
```

---

### Expected Response After Fix

```json
{
  "success": true,
  "meta": { ... },
  "totals": {
    "spend": 471530.29,
    "installs": 31875,
    "avgCpi": 14.79,
    "note": "Spend attributed to specific creatives"
  },
  "overallTotals": {
    "spend": 1553118.00,
    "installs": 109630,
    "avgCpi": 14.17,
    "byPlatform": {
      "meta": { "spend": 126305, "installs": 8017 },
      "snapchat": { "spend": 182825, "installs": 15529 },
      "google": { "spend": 1163222, "installs": 83211 },
      "tiktok": { "spend": 80766, "installs": 2873 }
    }
  },
  "creatives": [ ... ]
}
```

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/creative-insights/index.ts` | Add `fetchPlatformTotals()` function and include `overallTotals` in response |

---

### Why This Matters for AI Agents

With this change:
- AI agents can see **both** numbers and understand the distinction
- They can report creative-level insights accurately
- They can compare to overall spend and explain the gap ("X% of spend is attributed to specific creatives")
- No confusion about data accuracy

