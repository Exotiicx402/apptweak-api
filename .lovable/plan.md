

# Fix: Moloco 500 Error — BigQuery Missing `registrations` Column

## Root Cause

The network response confirms it: the KPI request (`skipAds: true`) returns HTTP 500 with:

```
"Unrecognized name: registrations at [10:18]"
```

The BigQuery table `moloco-lv` does not have a `registrations` column. The `ALTER TABLE ADD COLUMN IF NOT EXISTS` on line 934 runs but the BigQuery ALTER is async — the SELECT query fires before the schema change propagates, causing the query to fail. The error then falls through to the catch block on line 992 which only handles errors containing "schema" or "does not exist" — but `"Unrecognized name"` does not match either string, so it **re-throws** instead of falling back to live API.

## Fix (1 file)

### `supabase/functions/moloco-history/index.ts`

**Change 1 — Wait for ALTER TABLE result and verify success (lines 933-946)**

Before running the SELECT queries, await the ALTER TABLE response properly, check that it succeeded, and if it fails, log a warning but continue.

**Change 2 — Catch `Unrecognized name` as a schema error (line 997)**

Expand the schema error detection on line 997 to also match `"Unrecognized name"`:

```typescript
if (errorMessage.includes('schema') || errorMessage.includes('does not exist') || errorMessage.includes('Unrecognized name')) {
  console.log('BigQuery schema mismatch — will attempt live API fallback');
  bqQueryFailed = true;
} else {
  throw err;
}
```

This ensures that when the `registrations` column doesn't exist yet, the function falls back to the live Moloco API instead of returning a hard 500. The ALTER TABLE will add the column for future queries, and the live API data (with registrations from AppsFlyer merge) will be cached back via the MERGE statement, which will also succeed because the column will exist by then.

### Summary of Changes

| Line Range | Change |
|---|---|
| 933-946 | Await ALTER TABLE response, check for errors, add brief delay to let schema propagate |
| 997 | Add `'Unrecognized name'` to the schema error detection condition |

