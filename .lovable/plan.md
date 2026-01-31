

# Create Moloco BigQuery Table Schema

## Overview

The `moloco-history` edge function expects a BigQuery table at `polymarket-data-house.polymarket_hours.moloco-lv` but the table doesn't exist yet. You need to create this table in BigQuery with the correct schema.

## BigQuery Table Schema

Run this SQL in BigQuery Console to create the table:

```sql
CREATE TABLE `polymarket-data-house.polymarket_hours.moloco-lv` (
  date DATE NOT NULL,
  campaign_id STRING NOT NULL,
  campaign_name STRING,
  spend FLOAT64,
  installs INT64,
  impressions INT64,
  clicks INT64,
  fetched_at TIMESTAMP
);
```

## Column Definitions

| Column | Type | Description |
|--------|------|-------------|
| date | DATE | Campaign data date (part of composite primary key) |
| campaign_id | STRING | Moloco campaign identifier (part of composite primary key) |
| campaign_name | STRING | Human-readable campaign name |
| spend | FLOAT64 | Total spend in dollars |
| installs | INT64 | Number of app installs |
| impressions | INT64 | Number of ad impressions |
| clicks | INT64 | Number of ad clicks |
| fetched_at | TIMESTAMP | When this row was last synced |

## Steps to Create

1. Go to BigQuery Console: https://console.cloud.google.com/bigquery
2. Select project `polymarket-data-house`
3. Navigate to dataset `polymarket_hours`
4. Click "Create Table" or run the SQL above in the query editor
5. Verify the table exists

## After Creation

Once the table exists, the `moloco-history` function will:
- Query this table for historical data (dates before today)
- Call the live Moloco API only for today's data
- Automatically merge new data back into this table (write-back caching)

The composite key is `(date, campaign_id)` - the MERGE statement in the code uses these to update existing rows or insert new ones.

