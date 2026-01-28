

## Fix Meta Dashboard to Display Accurate Installs and Spend

### Problem Summary
The Meta Ads dashboard is showing **0 installs** and inconsistent spend totals because:
1. The `actions` JSON column (containing install data) is not being queried from BigQuery
2. The frontend hardcodes installs to 0 instead of extracting from API response
3. The backend edge function doesn't parse the `actions` JSON to return install counts

### Solution

#### 1. Update `meta-history` Edge Function
Modify the BigQuery queries to extract mobile app installs from the `actions` JSON column:

- Add a query to parse the JSON actions column and extract `mobile_app_install` action type values
- Include installs in the daily, campaign, and totals aggregations
- Calculate CPI (Cost Per Install) from spend/installs

**Key SQL changes:**
```sql
-- Extract installs from JSON actions column
JSON_EXTRACT_SCALAR(actions, '$[?(@.action_type=="mobile_app_install")].value') as installs
```

#### 2. Update `useMetaHistory` Hook Types
Add `installs` and `cpi` fields to the TypeScript interfaces:
- `DailyMetric` - add installs, cpi
- `CampaignMetric` - add installs, cpi  
- `Totals` - add installs, cpi

#### 3. Update `MetaHistoryDashboard` Component
- Add KPI cards for **Installs** and **CPI**
- Remove the hardcoded `installs: 0` 
- Add installs time series chart
- Update the campaign table to show actual install counts

#### 4. Test and Verify
- Test the edge function with Jan 20-27, 2026 date range
- Verify totals match Meta Ads Manager: ~$22,991 spend, ~1,754 installs

---

### Technical Details

**Files to modify:**

| File | Changes |
|------|---------|
| `supabase/functions/meta-history/index.ts` | Parse actions JSON, extract installs, calculate CPI |
| `src/hooks/useMetaHistory.ts` | Add installs/cpi to interfaces |
| `src/components/dashboard/MetaHistoryDashboard.tsx` | Add installs KPI card, remove hardcoded 0, add chart |

**BigQuery JSON Parsing:**
The `actions` column stores data like:
```json
[{"action_type": "mobile_app_install", "value": "100"}, {"action_type": "link_click", "value": "500"}]
```

We need to use BigQuery's `JSON_EXTRACT_ARRAY` and filtering to sum the `mobile_app_install` values.

**Revised Query Pattern:**
```sql
SELECT 
  DATE(timestamp) as date,
  SUM(spend) as spend,
  SUM(
    CAST(
      JSON_EXTRACT_SCALAR(
        (SELECT value FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) 
         WHERE JSON_EXTRACT_SCALAR(value, '$.action_type') = 'mobile_app_install'), 
        '$.value'
      ) AS INT64
    )
  ) as installs
FROM table
WHERE ...
GROUP BY date
```

