

## Update Slack List Items When Thread Replies Arrive

### Problem
When someone replies in-thread to a creative request, the DB gets updated (`thread_context`, `inspiration_url`) but the corresponding Slack List item is never updated with the new info or attachments.

### Solution

**1. Add `slack_list_item_id` column to `creative_requests`**
- New nullable text column to store the Slack List row ID (e.g. `Rec0ALA6T96CW`) returned when the item is created.

**2. Store the item ID on creation (all 3 push paths)**
- `slack-creative-events`: after `addToSlackList` returns an item ID, update the `creative_requests` row with it.
- `push-to-slack-list`: after successful create, update the row's `slack_list_item_id`.
- `slack-creative-scanner`: same treatment.

**3. Update Slack List item on thread replies**
- In `slack-creative-events`, when a thread reply matches a parent request (the existing `comment_on_existing` branch):
  - Read the parent's `slack_list_item_id`.
  - If it exists, call `slackLists.items.update` to append the new thread context to the Description column.
  - If the reply contains files/images, append those URLs to the Description as well.
- Use the same `toRichText` helper to build the updated description combining original description + thread context + file URLs.

### Files Changed
- **Migration**: add `slack_list_item_id text` column to `creative_requests`.
- **`supabase/functions/slack-creative-events/index.ts`**: save item ID after create; update Slack List item on thread replies.
- **`supabase/functions/push-to-slack-list/index.ts`**: save item ID after create.
- **`supabase/functions/slack-creative-scanner/index.ts`**: save item ID after create.

### Technical Detail: Slack List Update Payload
```typescript
// On thread reply, update the Description cell
await fetch(`${SLACK_API}/slackLists.items.update`, {
  method: "POST",
  headers: slackHeaders,
  body: JSON.stringify({
    list_id: SLACK_LIST_ID,
    cells: [
      {
        row_id: parentRequest.slack_list_item_id,
        column_id: COL_DESCRIPTION,
        rich_text: toRichText(updatedDescription),
      },
    ],
  }),
});
```

The updated description will concatenate: original description + "\n\n---\nThread updates:\n" + thread context + any file URLs.

