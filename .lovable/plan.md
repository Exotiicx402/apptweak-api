
# Competitor Watchlist for Polymarket

## What We're Building

A dedicated `/competitor-watchlist` page where you can track competitor Facebook ad activity using the Meta Ad Library API. You'll be able to add competitors by their Facebook Page ID, see their currently active ads, creative previews, how long each ad has been running, and which platforms they're running on.

No new API keys are needed — the existing `META_ACCESS_TOKEN` is already configured as a secret and works for the Ad Library API.

---

## How the Meta Ad Library API Works

The Meta Ad Library API (`/ads_archive`) is publicly accessible and doesn't require any special approval beyond a standard user access token. For each competitor Facebook Page you track, it returns:

- Active ads with creative snapshot images
- Ad body copy / headline text
- Which platforms the ad runs on (Facebook, Instagram, Messenger, etc.)
- Start date and stop date (or null if still running)
- Impression range (bucketed — e.g. "100K–500K")

What it does NOT provide for competitors: exact spend, clicks, conversions, or targeting.

**Key insight:** Ad run duration is the most valuable signal. Ads running 30+ days are almost always profitable — brands don't run losers for that long.

---

## Database Changes

### New `competitor_watchlist` table

Stores the list of competitors you want to track.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| name | text | e.g. "Robinhood", "Kalshi" |
| facebook_page_id | text | e.g. "123456789" |
| facebook_page_name | text | from Meta API |
| notes | text | optional internal notes |
| active | boolean | default true |
| created_at | timestamptz | |

RLS: Public read and insert for all authenticated users. Admin-write for deactivate/delete (for now, open insert/delete is fine since this is an internal tool).

---

## New Edge Function: `competitor-ad-library`

Calls `https://graph.facebook.com/v19.0/ads_archive` using the existing `META_ACCESS_TOKEN` secret.

**Accepts:**
```json
{
  "pageIds": ["123456", "789012"],
  "adActiveStatus": "ACTIVE",
  "limit": 20
}
```

**Returns per ad:**
- Page ID and name
- Ad body copy (truncated)
- Snapshot URL (hosted HTML preview of the creative)
- Publisher platforms array
- Start date + days running (calculated)
- Impression range

**Batching:** Meta allows up to 10 page IDs per request. If more competitors are added later, the function batches them.

---

## New Pages & Components

### `/competitor-watchlist` Page

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Competitor Watchlist          [+ Add Competitor]   │
│  Track competitor ad activity on Meta Ad Library    │
├─────────────────────────────────────────────────────┤
│  TRACKED COMPETITORS                                │
│  ┌────────────────────────────────────────────────┐ │
│  │ Robinhood  •  Page: 123456  •  Active ads: 12  │ │
│  │ Kalshi     •  Page: 789012  •  Active ads: 4   │ │
│  └────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  ACTIVE ADS            [Filter: All platforms ▼]   │
│                                                     │
│  ── Robinhood ─────────────────────────────────    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ [image]  │ │ [image]  │ │ [image]  │            │
│  │ 42 days  │ │ 12 days  │ │  3 days  │            │
│  │ FB + IG  │ │ FB + IG  │ │ IG only  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

### `AddCompetitorModal` Component

- Input field: Competitor display name (e.g. "Robinhood")
- Input field: Facebook Page ID
- Helper text: "You can find the Page ID by going to the competitor's Facebook page → About → Page Transparency section, or using tools like findmyfbid.com"
- On submit: saves to `competitor_watchlist` table

### `CompetitorAdCard` Component

Each ad card shows:
- Creative snapshot (image from `ad_snapshot_url`)
- Truncated ad copy
- **Days Running badge** — color coded:
  - Green (🟢) = 30+ days — likely profitable
  - Yellow (🟡) = 7–29 days — still testing
  - Gray (⚪) = <7 days — too early to tell
- Platform icons (Facebook, Instagram, etc.)
- Impression range badge

### `CompetitorAdFeed` Component

- Collapsible sections per competitor
- Loading skeletons while fetching
- Empty state if a competitor has no active ads
- "Refresh" button to re-fetch

---

## Implementation Steps

1. **Database migration** — create `competitor_watchlist` table with RLS policies
2. **Edge function** — `competitor-ad-library` calling Meta Ad Library API with existing token
3. **Update `supabase/config.toml`** — add `verify_jwt = false` for the new function
4. **Hook: `useCompetitorWatchlist`** — reads/writes the watchlist table (add, toggle active, delete)
5. **Hook: `useCompetitorAdLibrary`** — calls the edge function with all active page IDs, returns ads grouped by competitor
6. **Page: `/competitor-watchlist`** — main page with two sections (watchlist management + ad feed)
7. **Components** — `AddCompetitorModal`, `CompetitorAdCard`, `CompetitorAdFeed`
8. **Update `App.tsx`** — add the `/competitor-watchlist` route
9. **Update `Dashboard.tsx`** — add a nav link to the new page

---

## Pre-seed the Watchlist

The existing `COMPETITOR_APPS` list in `useCompetitorDownloadsHistory.ts` already has Polymarket's competitors (Underdog, DraftKings, FanDuel, PrizePicks, Fox Sports). However, we need their **Facebook Page IDs**, not their App Store IDs. The edge function will look up actual page names from Meta when first queried.

We'll pre-populate the `competitor_watchlist` table with the known competitors — you can add their Facebook Page IDs via the UI after launch.

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/[ts]_competitor_watchlist.sql` | New — table + RLS |
| `supabase/functions/competitor-ad-library/index.ts` | New — Meta Ad Library edge function |
| `supabase/config.toml` | Updated — add `verify_jwt = false` for new function |
| `src/hooks/useCompetitorWatchlist.ts` | New — CRUD for watchlist table |
| `src/hooks/useCompetitorAdLibrary.ts` | New — fetch ads from edge function |
| `src/pages/CompetitorWatchlist.tsx` | New — main page |
| `src/components/competitors/AddCompetitorModal.tsx` | New |
| `src/components/competitors/CompetitorAdCard.tsx` | New |
| `src/components/competitors/CompetitorAdFeed.tsx` | New |
| `src/App.tsx` | Updated — add `/competitor-watchlist` route |
| `src/components/Dashboard.tsx` | Updated — add nav link |

---

## One Thing to Note

The `META_ACCESS_TOKEN` expires every 60 days (next expiry: March 28, 2026 based on existing notes). The Ad Library API uses the same token, so this feature will need the same periodic token refresh your team already does for the Meta Ads integration.
