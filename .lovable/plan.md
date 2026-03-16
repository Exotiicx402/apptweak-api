

## Update Daily Slack Report Terminology

The cumulative report is already updated, but the daily report (`slack-daily-report/index.ts`) still uses old labels. Three changes needed in the `metricsBlock` function (lines 158-164):

| Current Label | New Label |
|---|---|
| `Results (API)` | `Payment Info Adds` |
| `Cost per Result` | `Cost per Add` |
| `Avg. Result Val` | `Avg. Result Value` |

These are string-only changes in the `metricsBlock` function. No logic changes. The edge function will be redeployed automatically.

