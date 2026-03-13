

## Plan: Make Kanban Cards Look Like Slack Messages

### Problem
The cards currently show an AI-summarized `description` instead of the original Slack message. Attachments (images stored in `inspiration_url`) aren't displayed. Deadline and figma_url are also missing from the cards.

### Changes

**1. Database: Add `raw_message` column**
- Add a `raw_message` text column to `creative_requests` to preserve the exact Slack message text (the current `description` field holds the AI summary).

**2. Edge Function: Store raw message**
- In `slack-creative-events/index.ts`, save `messageText` into the new `raw_message` field on insert.
- Thread replies already accumulate in `thread_context`.

**3. Kanban Card Redesign (both KanbanBoard + ReadOnlyKanbanBoard)**
- Restructure each card to resemble a Slack message:
  - **Header row**: Requester name (bold) + timestamp + priority badge
  - **Body**: Show `raw_message` (the actual Slack text), falling back to `description`
  - **Attachments**: Parse `inspiration_url` (comma-separated), render image URLs as inline thumbnails with click-to-expand
  - **Metadata pills**: Platform, Format, Deadline (with calendar icon), Figma link
  - **Thread context**: If `thread_context` exists, show a collapsed "N thread replies" indicator
- Update the `CreativeRequest` interface to include: `inspiration_url`, `deadline`, `figma_url`, `thread_context`, `raw_message`

**4. Query update**
- The `select("*")` in `CreativeScanner.tsx` already fetches all columns, so no query changes needed.

### Visual Layout (per card)
```text
┌──────────────────────────────────────┐
│ 👤 U0806LJJNCU   Mar 13, 9:21 AM  🔴│
│                                      │
│ "Can we get a march madness email    │
│  header 1000x347 similar to what     │
│  kalshi does? Need by noon today"    │
│                                      │
│ ┌────────┐                           │
│ │  img   │  (thumbnail from storage) │
│ └────────┘                           │
│                                      │
│ 📱 Email  📐 1000x347  📅 Noon today│
│ 💬 2 thread replies                  │
└──────────────────────────────────────┘
```

