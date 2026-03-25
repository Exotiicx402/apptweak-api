

## Pull Moloco Creatives into the Reporting Page

### Problem
The Moloco edge function currently requests data at `CAMPAIGN` granularity only. There is no ad/creative-level breakdown, so the creative performance grid only shows Meta creatives.

### What changes

**1. Update `moloco-history` edge function to return ad-level data**

The Moloco Reporting API supports `AD_GROUP` dimensions. We'll add a second report request (or modify the existing one) that uses `dimensions: ['DATE', 'AD_GROUP']` to get ad-group-level metrics (spend, installs, impressions, clicks). The response includes `ad_group.id` and `ad_group.title` which map to our `ad_id` / `ad_name` fields.

- Add a new function `createAdGroupReport()` that requests `dimensions: ['DATE', 'AD_GROUP']`
- Process the response into an `ads` array with the same shape Meta uses: `{ ad_id, ad_name, spend, impressions, clicks, ctr, installs, cpi }`
- Include this `ads` array in the response alongside existing `daily`, `campaigns`, `totals`
- This runs as a separate report request in parallel with the campaign report to avoid blocking

**2. Update `useMultiPlatformCreatives.ts` — add Moloco fetching**

- Add a `moloco` state alongside `meta`
- In `fetchAllPlatforms`, add a call to `fetchPlatform("moloco", "moloco-history", ...)` setting `setMoloco`
- Add `molocoAds` via `enrichAds(moloco.ads, "moloco")`
- Include Moloco ads in the blended view and `getPlatformBreakdown`
- Update `Platform` type to include `"moloco"`
- Update `hasAdData` and `platformCounts` to include Moloco

**3. Update `PlatformFilterBar.tsx` — add Moloco toggle**

- Import `molocoLogo`
- Add a `ToggleGroupItem` for `"moloco"` with the Moloco logo and count

**4. Update `CreativePerformanceGrid.tsx` — show Moloco platform badge**

- Ensure Moloco creatives display correctly with the "moloco" platform label
- Moloco won't have video metrics (thumbstop, avg watch time) so those will show as dashes, which already works

### What stays the same
- The campaign-level totals and daily breakdown for Moloco remain unchanged
- Meta creative fetching is unaffected
- The blended view will aggregate creatives with the same `ad_name` across both platforms

### Technical notes
- Moloco ad groups use naming conventions that may differ from Meta — the creative naming parser will handle what it can, and unknowns will show as "—"
- The second report request adds ~5-10s to Moloco fetch time due to the async polling pattern
- Rate limit (300 req/5min) is respected since we're only adding one additional report creation + poll cycle

