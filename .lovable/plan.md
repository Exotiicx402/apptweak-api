

# Fix Cumulative Report End Date: Use 2 Days Ago Instead of Yesterday

## The Problem
The cumulative report uses "yesterday" as the end date, but Meta data for yesterday isn't fully collected yet. When the report runs (e.g., at 12:16 PM PST on the 25th), the 24th's data isn't complete. The last fully-collected day is the 23rd.

## The Fix
One simple change in `supabase/functions/slack-cumulative-report/index.ts`:

Change `getYesterdayEST()` to return **2 days ago** instead of 1 day ago. This ensures the cumulative report only includes fully-collected data (Feb 18 through 2 days ago).

### Specific change:
- Rename `getYesterdayEST()` to `getTwoDaysAgoEST()` (or similar) and change the date offset from `-1` to `-2`
- The auto-sync call before the report should also sync up to 2 days ago (not yesterday), keeping it consistent

Everything else stays the same — the daily report is not touched at all.

