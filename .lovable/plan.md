

## Add TikTok Integration to Reporting Page

### Overview

Add TikTok Ads data to the Performance Report page by creating a new edge function that queries the BigQuery table `polymarket-data-house.polymarket_hours.tiktok` and integrating it into the existing reporting UI.

---

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/tiktok-history/index.ts` | Create | Edge function to query TikTok data from BigQuery |
| `supabase/config.toml` | Modify | Register the new edge function |
| `src/hooks/useReportingData.ts` | Modify | Add TikTok to the parallel platform fetches |
| `src/pages/Reporting.tsx` | Modify | Add TikTok row to platform display |

---

### Step 1: Create TikTok History Edge Function

Create `supabase/functions/tiktok-history/index.ts` following the established pattern from Google Ads and Snapchat:

- Use Google OAuth to get BigQuery access token
- Query the `tiktok` table with date range filters
- Return daily metrics, campaign breakdown, and totals
- Calculate CPI (spend / installs)

**Initial SQL queries will assume Windsor's standard column naming:**
```sql
SELECT 
  DATE(timestamp) as date,
  SUM(spend) as spend,
  SUM(impressions) as impressions,
  SUM(clicks) as clicks,
  SUM(conversions) as installs
FROM `polymarket-data-house.polymarket_hours.tiktok`
WHERE DATE(timestamp) BETWEEN @start AND @end
GROUP BY date
```

Note: If the column names differ from this pattern, we'll adjust based on the actual schema (similar to what we did for Google Ads).

---

### Step 2: Add Secret for TikTok Table ID

Add a new secret `TIKTOK_BQ_TABLE_ID` with the value you provided:
```
polymarket-data-house.polymarket_hours.tiktok
```

This follows the same pattern as other platforms (`GOOGLE_ADS_BQ_TABLE_ID`, `SNAPCHAT_BQ_TABLE_ID`, etc.).

---

### Step 3: Register Edge Function in Config

Add to `supabase/config.toml`:
```toml
[functions.tiktok-history]
verify_jwt = false
```

---

### Step 4: Update Reporting Hook

Modify `src/hooks/useReportingData.ts`:

- Add `tiktok` to the `ReportingData` interface
- Fetch `tiktok-history` in parallel with other platforms
- Include TikTok in totals calculation

```typescript
interface ReportingData {
  meta: PlatformMetrics;
  snapchat: PlatformMetrics;
  unity: PlatformMetrics;
  googleAds: PlatformMetrics;
  tiktok: PlatformMetrics;  // NEW
  totals: { ... };
}
```

---

### Step 5: Update Reporting Page UI

Add TikTok row to `src/pages/Reporting.tsx`:

```jsx
<PlatformMetricsRow
  platform="TikTok"
  spend={data.tiktok.spend}
  installs={data.tiktok.installs}
  cpi={data.tiktok.cpi}
  loading={data.tiktok.isLoading}
  error={data.tiktok.error}
/>
```

Also update:
- The `anyPlatformLoading` check to include `data.tiktok.isLoading`
- The empty state message to mention TikTok

---

### Technical Details

**Edge Function Structure:**
- Uses existing Google OAuth flow for BigQuery access (same as all other platforms)
- Parses the full table path from `TIKTOK_BQ_TABLE_ID` secret
- Runs 4 queries in parallel: daily, campaigns, current totals, previous totals
- Returns standardized response format matching other platforms

**Schema Assumptions (based on Windsor patterns):**
| Expected Column | Type | Maps To |
|-----------------|------|---------|
| `timestamp` or `date` | DATE/TIMESTAMP | date |
| `spend` | NUMERIC | spend |
| `impressions` | INTEGER | impressions |
| `clicks` | INTEGER | clicks |
| `conversions` | INTEGER | installs |
| `campaign` or `campaign_name` | STRING | campaign_name |

If the actual TikTok table schema differs, we'll need to adjust the queries (you can share the schema screenshot like you did for Google Ads).

---

### Secrets Required

| Secret Name | Value | Status |
|------------|-------|--------|
| `TIKTOK_BQ_TABLE_ID` | `polymarket-data-house.polymarket_hours.tiktok` | Needs to be added |

The existing Google OAuth secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) and BigQuery config (`BQ_PROJECT_ID`, `BQ_DATASET_ID`) are already configured and will be reused.

