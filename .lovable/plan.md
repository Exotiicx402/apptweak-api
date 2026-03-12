

# Slack Creative Request Scanner

## What it does
An edge function that runs every 15 minutes, reads recent messages from Slack channel `C09HBDKSUGH` (hours-creative-polymarket), uses AI to identify creative requests (even informal ones in threads), and posts a summary notification to channel `C0ALEBYFJNQ`.

## Architecture

```text
┌──────────────────────┐     every 15 min      ┌─────────────────────────┐
│  pg_cron scheduler   │ ───────────────────▶   │  slack-creative-scanner │
└──────────────────────┘                        │  (edge function)        │
                                                └────────┬────────────────┘
                                                         │
                          ┌──────────────────────────────┐│┌──────────────────┐
                          │ 1. Read C09HBDKSUGH history  │││ 2. Read threads  │
                          │    (last 15 min messages)    │││    for context   │
                          └──────────────────────────────┘│└──────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────────┐
                                                │ 3. AI (Gemini Flash)│
                                                │    Classify msgs as │
                                                │    creative requests│
                                                └────────┬────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────────┐
                                                │ 4. Post summary to  │
                                                │    C0ALEBYFJNQ      │
                                                └─────────────────────┘
```

## Implementation steps

1. **Link Slack connection** — Connect "SLACK UPDATES LOVABLE AD REVIEW" to this project so `SLACK_API_KEY` and `LOVABLE_API_KEY` are available.

2. **Create `supabase/functions/slack-creative-scanner/index.ts`**:
   - Read messages from `C09HBDKSUGH` via Slack `conversations.history` (last 15 min window) through the connector gateway.
   - For messages with thread replies, fetch `conversations.replies` to get full context.
   - Send message text to Gemini 2.5 Flash via Lovable AI to classify whether each message is a creative request and extract key fields (creative name, platform, format, priority, description).
   - Track last scan timestamp in a `scanner_state` database table to avoid duplicate alerts.
   - Post formatted summary of new requests to `C0ALEBYFJNQ` with details.

3. **Create `scanner_state` table** — Single-row table storing `last_scanned_ts` to track the watermark.

4. **Schedule via pg_cron** — Every 15 minutes.

5. **Add config.toml entry** — `verify_jwt = false` for the new function.

## Technical details

- **Slack API calls** go through `https://connector-gateway.lovable.dev/slack/api/` with `Authorization: Bearer LOVABLE_API_KEY` and `X-Connection-Api-Key: SLACK_API_KEY`.
- **AI classification prompt** will instruct the model to look for creative requests even in casual messages (not just formal form submissions), extracting: what's needed, platform, size/format, urgency, any attached reference files.
- **Notification format**: A clean Slack Block Kit message listing each detected request with the extracted details and a link back to the original message.
- Messages that are clearly not requests (general chat, reactions, status updates) will be filtered out by the AI.

