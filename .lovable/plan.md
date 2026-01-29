

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

### ✅ Implemented Components

| File | Description |
|------|-------------|
| `src/pages/Reporting.tsx` | Main reporting page with date range picker and platform sections |
| `src/components/reporting/PlatformMetricsRow.tsx` | Reusable row showing platform name + 3 KPI cards |
| `src/components/reporting/TotalMetricsSection.tsx` | Highlighted section for aggregated totals |
| `src/hooks/useReportingData.ts` | Hook that fetches data from all platforms in parallel |
| `supabase/functions/google-ads-history/index.ts` | Edge function to query Windsor's Google Ads BigQuery table |

---

### Notes

- **TikTok**: Ready to add once BigQuery table ID is provided
- **No previous period comparison**: For client simplicity, showing current values only (no trend arrows)
- **Blended CPI**: Calculated as Total Spend / Total Installs across all platforms


