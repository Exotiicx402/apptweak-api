

## Fix: Clear stale zero-count cache and re-fetch AppsFlyer data

### Problem
When the AppsFlyer quota was hit, the caching logic wrote `event_count = 0` for all dates. Now that the quota has reset, the system reads cached zeros and never re-fetches.

### Plan

**1. Clear the stale cache entries (database migration)**
- Delete all rows from `appsflyer_event_cache` where `media_source = 'moloco_int'` so the system re-fetches everything fresh.

**2. Fix the caching logic to avoid this in the future (`moloco-history/index.ts`)**
- Update `fetchAppsFlyerEventsWithCache` so it does NOT cache zero-count results when the API returns an empty response (which signals a quota/error, not truly zero events).
- Specifically: only write to cache when `liveData.byDate.size > 0` (meaning the API actually returned data). If the API returns nothing, skip caching and just return what we have.

**3. Test the reporting page**
- After deploying, trigger a report fetch to confirm FTDs and registrations populate from fresh AppsFlyer data and get cached correctly.

### Technical detail
The fix on line 618 changes from:
```
if (liveData.total > 0 || liveData.byDate.size === 0)
```
to only caching when we received actual data rows back from the API, preventing empty/error responses from poisoning the cache.

