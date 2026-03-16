

## Update Cumulative Slack Report Terminology

The cumulative Slack report still uses "FTD" terminology in its output. Three label changes are needed in the `metricsBlock` function of `supabase/functions/slack-cumulative-report/index.ts`:

### Changes (all in `metricsBlock` function, lines 144-153)

| Current Label | New Label |
|---|---|
| `Results (FTDs)` | `Payment Info Adds` |
| `Cost per Result` | `Cost per Add` |
| `Avg. FTD Value` | `Avg. Result Value` |

These are the three lines in the `metricsBlock` function (lines 147, 148, 151) that format the Slack message rows. No other logic changes needed — just string label updates. The edge function will be redeployed automatically.

