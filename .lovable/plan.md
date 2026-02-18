
## Add Cursor-Based Pagination to the Competitor Ad Library

### The Problem

The `competitor-ad-library` edge function currently makes a single API call per strategy and stops after the first page of results (up to 50 ads). Meta's Ad Library API returns a `paging.cursors.after` token in every response, which you must pass back as `after=<cursor>` to get the next page. We're ignoring this entirely, which is why Kalshi shows 1 ad despite running many campaigns.

### The Fix

Implement a `fetchAllPages` helper inside the edge function that follows the pagination cursor until:
- Meta returns no `paging.next` link (end of results), OR
- A safety cap is hit (e.g. 500 ads per query) to prevent infinite loops / timeout

### Technical Details

**Current behavior:**
```
Request → Page 1 (50 ads) → Stop
```

**After fix:**
```
Request → Page 1 (50 ads) → cursor → Page 2 (50 ads) → cursor → Page 3 ... → Stop when no next
```

Meta's response shape includes:
```json
{
  "data": [...],
  "paging": {
    "cursors": {
      "before": "...",
      "after": "WzI1..."
    },
    "next": "https://graph.facebook.com/..."
  }
}
```

We follow `paging.next` directly (it already includes all params + the cursor).

### Files to Modify

**`supabase/functions/competitor-ad-library/index.ts`**

- Add a `fetchAllPages(initialUrl, maxAds)` async helper that:
  - Fetches the initial URL
  - Collects all `data` items
  - If `paging.next` exists and total < `maxAds`, fetches the next URL
  - Repeats until exhausted or cap hit
- Replace the two single `fetch()` calls (Strategy 1 and Strategy 2) with calls to `fetchAllPages()`
- Set a generous cap of `500` ads per query to avoid Supabase edge function timeouts (30s limit)
- Add logging of how many pages were fetched per query

### Safety Considerations

- Edge functions time out after 30 seconds — each page fetch takes ~300-500ms, so 500 ads / 50 per page = 10 pages max = ~5 seconds. Well within limits.
- We keep the deduplication logic untouched — it handles overlapping results from both strategies correctly.
- No schema changes, no new secrets, no UI changes needed.

### Expected Outcome

For a competitor like Kalshi that runs many ads, you should see a jump from 1-2 ads to potentially 50-200+ ads depending on what Meta has indexed for their page ID.
