

## Implementation: Daily Slack Performance Report

### Step 1: Add Secret

Store the Slack webhook URL as `SLACK_WEBHOOK_URL` in the project secrets.

### Step 2: Create Edge Function

**File**: `supabase/functions/slack-daily-report/index.ts`

The function will:
- Calculate yesterday's date in EST timezone (America/New_York)
- Fetch all 6 platform endpoints in parallel using the project's Supabase URL and anon key
- Process results and calculate totals
- Format a Slack Block Kit message with the performance table
- POST to the webhook URL

### Step 3: Register Function

**File**: `supabase/config.toml`

Add:
```toml
[functions.slack-daily-report]
verify_jwt = false
```

### Step 4: Schedule with pg_cron

Create a cron job that runs at 14:00 UTC (9am EST):
```sql
SELECT cron.schedule(
  'daily-slack-report',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://agususzieosizftucxxq.supabase.co/functions/v1/slack-daily-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Expected Result

Every day at 9am EST, you'll receive a Slack message like:

```
📊 Daily Performance Report - Jan 29, 2026

Platform         Spend        Installs      CPI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Meta             $12,450      3,200         $3.89
Snapchat         $8,320       2,150         $3.87
Unity            $5,600       1,800         $3.11
Google Ads       $4,200       980           $4.29
TikTok           $3,100       850           $3.65
Moloco           $2,800       720           $3.89
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL            $36,470      9,700         $3.76
```

