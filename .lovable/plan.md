

# Moloco Data Caching to BigQuery

## Overview

Store Moloco API data in BigQuery after fetching, then read from BigQuery for historical data (like Meta, Snapchat, and Unity). This eliminates redundant API calls and prevents rate limiting issues.

## Current State

The `moloco-history` function currently:
- Calls the Moloco API directly for every request
- Makes 10-60+ API calls per request (auth, create report, poll status up to 30 times, download)
- Has no caching layer - fetches the same data repeatedly
- Uses up the 300 requests/5min quota quickly

## Solution: BigQuery Caching (Same Pattern as Unity/Meta/Snapchat)

### Architecture

```text
User Request (date range)
       |
       v
+------------------+
| moloco-history   |
+------------------+
       |
       +-- Historical dates --> Query BigQuery (fast, no API calls)
       |
       +-- Today's date ------> Call Moloco API (live data)
                                     |
                                     v
                               Store in BigQuery (for future queries)
```

---

## Technical Details

### 1. New Secret Required

Need to add the Moloco BigQuery table reference:

**Secret Name:** `MOLOCO_BQ_TABLE_ID`
**Value:** `polymarket-data-house.polymarket_hours.moloco-lv`

### 2. File: `supabase/functions/moloco-history/index.ts`

**Changes:**

**A. Add BigQuery helper functions** (same pattern as unity-history):
- `getGoogleAccessToken()` - OAuth for BigQuery
- `resolveBigQueryTarget()` - Parse MOLOCO_BQ_TABLE_ID
- `queryBigQuery()` - Execute BigQuery queries
- `mergeIntoBigQuery()` - Insert/update rows

**B. Modify main logic:**

Current flow:
```text
1. Call Moloco API for full date range
2. Return results
```

New flow:
```text
1. Check if today is in date range
2. Query BigQuery for historical data (start date to yesterday)
3. If today is included:
   a. Call Moloco API for today only
   b. Merge today's data into BigQuery (cache it)
4. Combine BigQuery + live data
5. Return results
```

**C. Data schema for BigQuery:**
- `date` (DATE) - Primary key
- `campaign_id` (STRING) - Primary key
- `campaign_name` (STRING)
- `spend` (FLOAT64)
- `installs` (INT64)
- `impressions` (INT64)
- `clicks` (INT64)
- `fetched_at` (TIMESTAMP)

**D. Previous period handling:**
- Query BigQuery for previous period (no API call needed)
- Only call API if previous period data is missing from BigQuery

### 3. BigQuery Table Creation

The table `polymarket-data-house.polymarket_hours.moloco-lv` needs to exist with the correct schema. You may need to create this table manually in BigQuery or verify it already exists.

---

## Key Benefits

1. **Rate limit protection**: Only call API for missing/today's data
2. **Faster responses**: BigQuery queries are instant vs. 30-60 second API polling
3. **Cost reduction**: Fewer API calls = lower usage
4. **Consistency**: Same architecture as Meta, Snapchat, Unity

## Expected Behavior After Implementation

| Scenario | API Calls | BigQuery Calls |
|----------|-----------|----------------|
| Query last 7 days (including today) | 1 (for today only) | 2 (historical + previous period) |
| Query last 7 days (excluding today) | 0 | 2 (both periods from cache) |
| First query (empty cache) | 2 (current + previous) | 0 (then stores results) |

---

## Files to Modify

- `supabase/functions/moloco-history/index.ts` - Main implementation

## New Secrets Needed

- `MOLOCO_BQ_TABLE_ID` = `polymarket-data-house.polymarket_hours.moloco-lv`

