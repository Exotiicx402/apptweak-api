

## Daily Slack Performance Report

### Overview

Create a scheduled Slack notification that sends yesterday's performance metrics across all platforms every day at 9am EST. The message will include spend, installs, and CPI for each platform plus blended totals.

---

### What You'll Get

A daily Slack message formatted like this:

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

---

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/slack-daily-report/index.ts` | Create | Edge function that fetches all platform data and posts to Slack |
| `supabase/config.toml` | Modify | Register the new edge function |

---

### Implementation Steps

#### Step 1: Add Slack Webhook Secret

You'll need to create a Slack Incoming Webhook:
1. Go to your Slack workspace settings
2. Create an app or use an existing one
3. Enable "Incoming Webhooks"
4. Create a webhook for the channel where you want reports

Then add the webhook URL as a secret: `SLACK_WEBHOOK_URL`

#### Step 2: Create the Edge Function

The function will:
1. Calculate yesterday's date (in EST timezone)
2. Fetch all 6 platform `-history` endpoints in parallel (same as the reporting page does)
3. Process the results and extract totals
4. Format a nicely structured Slack message using Block Kit
5. POST to the Slack webhook

```text
[Edge Function Flow]

9am EST trigger
      │
      ▼
┌─────────────────────┐
│ Calculate yesterday │
│ date (EST timezone) │
└─────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│     Parallel fetch all platform APIs        │
│  meta │ snap │ unity │ google │ tiktok │ mol│
└─────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────┐
│ Format Slack blocks │
│ with spend/installs │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│  POST to Slack      │
│  webhook URL        │
└─────────────────────┘
```

#### Step 3: Schedule with pg_cron

Add a cron job to run at 9am EST daily:
- EST is UTC-5 (or UTC-4 during daylight saving)
- 9am EST = 14:00 UTC (standard) or 13:00 UTC (daylight)
- We'll use `0 14 * * *` for 9am EST (adjustable for DST)

---

### Technical Details

**Slack Message Format:**
Using Slack Block Kit for clean formatting with:
- Header section with date
- Table-like formatting using code blocks (monospace)
- Platform-by-platform breakdown
- Totals row at the bottom
- Optional: Color-coded performance vs previous day

**Error Handling:**
- If a platform fails, show "Error" instead of numbers
- Still send the report with available data
- Log failures for debugging

**Timezone Handling:**
- Calculate "yesterday" in EST/EDT timezone to match business reporting
- Use `America/New_York` for automatic DST handling

---

### Secrets Required

| Secret Name | Value | Status |
|-------------|-------|--------|
| `SLACK_WEBHOOK_URL` | Your Slack webhook URL | Needs to be added |

---

### Effort Estimate

This is a **straightforward implementation** because:
- All the data-fetching logic already exists (the `-history` edge functions)
- The cron infrastructure is already set up (pg_cron + net.http_post)
- It's essentially a server-side version of what the Reporting page does

**Time to implement: ~15-20 minutes**

