

# Fix: Moloco Creatives Not Appearing in Grid

## Root Cause

`fetchMolocoAdGroupData` on line 714 calls `createReport(token, adAccountId, startDate, endDate)` **without specifying dimensions**, so it defaults to `['DATE', 'CAMPAIGN']`. The response rows contain `campaign` objects but **no `ad_group` objects**. Then `processAdGroupRows` reads `row.ad_group?.id` and `row.ad_group?.title`, which are both `undefined`, so every row becomes `ad_group_name: 'Unknown'` and they all collapse into a single useless entry.

## Fix

One line change in `supabase/functions/moloco-history/index.ts`:

**Line 714** — pass `['DATE', 'AD_GROUP']` as the dimensions parameter:
```typescript
const reportId = await createReport(token, adAccountId, startDate, endDate, ['DATE', 'AD_GROUP']);
```

This tells Moloco's reporting API to break results down by ad group, so `row.ad_group.id` and `row.ad_group.title` are populated. The rest of the pipeline (`processAdGroupRows` → `aggregateAdGroups` → response `ads` array → `useMultiPlatformCreatives`) already handles this shape correctly.

No other files need to change.

