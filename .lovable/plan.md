
# Competitor Search — Find Pages by Name, Not ID

## The Problem

Currently, adding a competitor requires knowing their exact Facebook Page ID (a long numeric string), which is not user-friendly. The user wants to search by brand name (e.g. "Kalshi") and just click to add — no manual ID lookup.

## How It Works

Meta's Graph API has a **Page Search endpoint** that accepts a text query and returns matching Facebook Pages including their IDs, names, categories, and follower counts. We proxy this through a backend function so the `META_ACCESS_TOKEN` stays server-side.

**The flow:**
1. User types a competitor name in the search field
2. Results appear as a dropdown (page name, category, follower count)
3. User clicks a result — it's added to the watchlist
4. The Page ID is stored in the database automatically (invisible to the user)

---

## What Changes

### New Edge Function: `facebook-page-search`

A lightweight backend function that calls:

```
GET https://graph.facebook.com/v19.0/pages/search
  ?q=kalshi
  &fields=id,name,category,fan_count,verification_status,picture
  &access_token=<META_ACCESS_TOKEN>
  &limit=8
```

Returns a ranked list of matching pages. Uses the existing `META_ACCESS_TOKEN` secret — no new credentials needed.

**Response shape:**
```json
{
  "results": [
    {
      "id": "123456789",
      "name": "Kalshi",
      "category": "Finance",
      "fanCount": 12400,
      "verified": true,
      "pictureUrl": "https://..."
    }
  ]
}
```

Added to `supabase/config.toml` with `verify_jwt = false`.

---

### Updated `AddCompetitorModal` — Replaced with a Search UI

The current modal (two text inputs: Name + Page ID) is replaced with a **search-first experience**:

**New modal flow:**
1. A single search input: "Search for a competitor..."
2. As the user types (debounced ~400ms), results appear as a list below
3. Each result shows: page name, category, follower count, verified badge
4. User clicks a result — it pre-fills the form fields and shows a confirmation step
5. Optional "Notes" field still available
6. "Add Competitor" button saves to the database

**Edge cases handled:**
- No results found → "No pages found. Try a different name."
- API error → graceful fallback with manual Page ID entry still available as a small "Enter ID manually" toggle
- Loading state → skeleton rows while searching
- Debounce prevents excessive API calls while typing

---

### New Hook: `useFacebookPageSearch`

A React hook that:
- Accepts a query string
- Calls the `facebook-page-search` edge function (debounced, 400ms)
- Returns `{ results, isSearching, error }`
- Only fires when query length >= 2 characters

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/functions/facebook-page-search/index.ts` | New edge function — proxies Meta Page Search API |
| `supabase/config.toml` | Add `verify_jwt = false` for new function |
| `src/hooks/useFacebookPageSearch.ts` | New hook — debounced page search |
| `src/components/competitors/AddCompetitorModal.tsx` | Redesigned — search-first UI replacing manual ID input |

---

## What Stays Unchanged

- `competitor_watchlist` database table — same schema, same RLS
- `useCompetitorWatchlist` hook — same CRUD logic
- `competitor-ad-library` edge function — still uses Page IDs internally
- `CompetitorAdFeed`, `CompetitorAdCard`, `CompetitorWatchlist` page — no changes needed

---

## Technical Note on the Meta Page Search API

The `/pages/search` endpoint is part of the standard Meta Graph API and works with the same User Access Token already in use. It returns pages that are publicly discoverable. For well-known brands it consistently returns the correct verified page as the top result.

One limitation: Meta may return fewer results for very small or niche pages. The "Enter ID manually" fallback ensures the user is never blocked.
