

# Create `slack-creative-events` Edge Function

## Problem
Slack's Event Subscriptions is trying to verify the endpoint URL with a `challenge` request, but the `slack-creative-events` edge function doesn't exist yet, so it fails.

## Plan

### 1. Create the edge function `supabase/functions/slack-creative-events/index.ts`

This function handles:

**Challenge verification** (required first): When Slack sends `{ type: "url_verification", challenge: "..." }`, respond immediately with `{ challenge: "..." }`. This is what's failing right now.

**Message events**: When `type === "event_callback"` and `event.type === "message"`:
- Ignore bot messages, message edits, and deletions
- Only process messages from the source channel (`C09HBDKSUGH`)
- For **thread replies** (`event.thread_ts` exists): check if `thread_ts` matches an existing `creative_requests.message_ts` — if so, classify as comment on existing request and update `thread_context`
- For **top-level messages**: send to AI (same Gemini Flash model) to classify as `new_request` or `not_a_request`
- For new requests: insert into `creative_requests` table, post summary to `#ad-review-pipeline` (`C0ALEBYFJNQ`)
- Capture any `event.files` attachments and store image URLs in a new `inspiration_url` column
- Deduplicate by `message_ts`
- Respond with `200 OK` quickly (Slack requires response within 3 seconds — so we'll process async after sending the response isn't possible in edge functions, but the AI call should be fast enough with Flash)

### 2. Add to `supabase/config.toml`

```toml
[functions.slack-creative-events]
verify_jwt = false
```

### 3. Database migration

Add two columns to `creative_requests`:
- `inspiration_url TEXT` — reference image URLs from attachments
- `thread_context TEXT` — accumulated thread reply summaries

### 4. AI classification prompt

Updated prompt with three classifications:
- `new_request` — extract description, requester, platform, format, priority, message_ts, inspiration_urls
- `comment_on_existing` — link via `related_message_ts`
- `not_a_request` — ignore

### Files to create/edit
- **Create**: `supabase/functions/slack-creative-events/index.ts`
- **Edit**: `supabase/config.toml` (add function entry)
- **Migration**: Add `inspiration_url` and `thread_context` columns to `creative_requests`

Once deployed, hit **Retry** on the Slack Event Subscriptions page and the challenge should pass.

