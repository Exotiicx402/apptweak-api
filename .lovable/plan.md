

## Client-Facing Reporting Page

### Overview
A new page at `/reporting` designed for client viewing that displays aggregated performance metrics across all ad platforms. Clean, focused view showing only the essential KPIs: **Spend**, **Installs**, and **CPI**.

---

### Page Layout

```text
+----------------------------------------------------------+
|  Performance Report                    [Date Range Picker]|
+----------------------------------------------------------+
|                                                          |
|  TOTAL (All Channels)                                    |
|  +----------------+  +----------------+  +----------------+
|  |  Total Spend   |  | Total Installs |  |  Blended CPI  |
|  |   $125,430     |  |    42,350      |  |    $2.96      |
|  +----------------+  +----------------+  +----------------+
|                                                          |
+----------------------------------------------------------+
|                                                          |
|  BY PLATFORM                                             |
|                                                          |
|  Meta Ads                                                |
|  +----------------+  +----------------+  +----------------+
|  |    Spend       |  |    Installs    |  |      CPI      |
|  |   $45,000      |  |    15,000      |  |    $3.00      |
|  +----------------+  +----------------+  +----------------+
|                                                          |
|  Snapchat                                                |
|  +----------------+  +----------------+  +----------------+
|  |    Spend       |  |    Installs    |  |      CPI      |
|  |   $30,000      |  |    12,000      |  |    $2.50      |
|  +----------------+  +----------------+  +----------------+
|                                                          |
|  Unity                                                   |
|  +----------------+  +----------------+  +----------------+
|  |    Spend       |  |    Installs    |  |      CPI      |
|  |   $25,430      |  |     8,350      |  |    $3.05      |
|  +----------------+  +----------------+  +----------------+
|                                                          |
|  Google Ads                                              |
|  +----------------+  +----------------+  +----------------+
|  |    Spend       |  |    Installs    |  |      CPI      |
|  |   $25,000      |  |     7,000      |  |    $3.57      |
|  +----------------+  +----------------+  +----------------+
|                                                          |
+----------------------------------------------------------+
```

---

### Components to Create

| File | Description |
|------|-------------|
| `src/pages/Reporting.tsx` | Main reporting page with date range picker and platform sections |
| `src/components/reporting/PlatformMetricsRow.tsx` | Reusable row showing platform name + 3 KPI cards |
| `src/components/reporting/TotalMetricsSection.tsx` | Highlighted section for aggregated totals |
| `src/hooks/useReportingData.ts` | Hook that fetches data from all platforms in parallel |
| `supabase/functions/google-ads-history/index.ts` | Edge function to query Windsor's Google Ads BigQuery table |

---

### Implementation Details

#### 1. Google Ads History Edge Function

Create a new edge function that queries the `GOOGLE_ADS_BQ_TABLE_ID` (Windsor data). This follows the same pattern as `meta-history`:

- Query for daily aggregates: spend, conversions (installs), CPI
- Windsor typically uses columns like: `date`, `campaign_name`, `metrics_cost_micros`, `metrics_conversions`
- Returns totals for the selected date range

#### 2. Unified Reporting Hook

The hook will:
- Accept start/end dates
- Fetch data from all 4 platforms in parallel using existing edge functions:
  - `meta-history`
  - `snapchat-history`
  - `unity-history`
  - `google-ads-history` (new)
- Return normalized data with totals for each platform
- Calculate grand totals across all platforms

#### 3. Page Component

- Date range picker at the top (reuses existing `DateRangePicker`)
- "Total" section with large KPI cards showing combined metrics
- Platform sections, each showing spend/installs/CPI
- Clean, minimal design suitable for client viewing
- Loading states for each section

#### 4. Router Update

Add the new route to `App.tsx`:
```typescript
<Route path="/reporting" element={<Reporting />} />
```

---

### Data Flow

1. User selects date range and clicks Apply
2. Hook calls all 4 history endpoints in parallel
3. Each endpoint returns: `{ totals: { spend, installs, cpi } }`
4. Hook calculates grand totals: sum of spend, sum of installs, weighted CPI
5. UI displays individual platform metrics and combined totals

---

### Notes

- **TikTok**: We'll add a placeholder section for TikTok. Once you provide the BigQuery table ID, we can enable it.
- **No previous period comparison**: For client simplicity, showing current values only (no trend arrows)
- **Blended CPI**: Calculated as Total Spend / Total Installs across all platforms

