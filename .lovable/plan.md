
Goal
- Ensure every pushed Slack List item gets a real Name (from the request summary/description) and lands in the New group instead of Ungrouped.

What I found
- The current list-create payload only sets Description/Platform/Format.
- It does not set:
  1) the Name column, so Slack shows “Untitled item”
  2) the Select/Status column used for grouping, so rows fall into “Ungrouped”.
- This affects manual push (`push-to-slack-list`) and the auto-push paths (`slack-creative-scanner`, `slack-creative-events`).

Implementation plan
1) Add explicit Name + New-group fields to list creation payloads
- Update all 3 edge functions to include:
  - Name column (rich_text) built from the request summary/description
  - Status/Select column with the New option id
- Keep existing Description/Platform/Format mappings.

2) Add a deterministic title generator
- Build a small helper in each function:
  - Use request description as source
  - Trim whitespace/newlines
  - Prefer first sentence / short phrase
  - Cap length (e.g., ~70 chars) with ellipsis
  - Fallback: “Creative Request”
- This guarantees “Untitled item” is never created.

3) Add a safety fallback after create
- If create succeeds but returned fields are missing Name or Select:
  - Immediately call `slackLists.items.update` for that new row id
  - Patch Name and Select(New)
- This protects against partial field acceptance.

4) Keep logs actionable
- Log the exact `initial_fields` being sent for Name + Select.
- Log Slack errors with response body when New option/column mapping fails.

Technical details
- Use Slack field formats exactly as required:
  - Text fields: `rich_text`
  - Grouping field: `select: ["<NewOptionId>"]`
- Use the discovered list mappings (already visible in logs/debug item payload):
  - Name column id
  - Select/status column id
  - New option id
- Apply the same field map across:
  - `supabase/functions/push-to-slack-list/index.ts`
  - `supabase/functions/slack-creative-scanner/index.ts`
  - `supabase/functions/slack-creative-events/index.ts`

Validation plan
1) From `/creative-scanner`, click Send on one New card.
2) Confirm in Slack List:
- Item title is populated (not “Untitled item”)
- Item appears under New (not Ungrouped).
3) Trigger scanner/event auto-push once and confirm same behavior.
4) Check edge-function logs for create/update success and no `invalid_arguments`.
