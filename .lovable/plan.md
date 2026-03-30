
Goal: add true Moloco creative asset support, separate from Meta, so Moloco creatives can show thumbnails/media in the reporting grid and detail dialog.

What I found
- Moloco performance data already exists: `supabase/functions/moloco-history/index.ts` returns ad-group level rows and the UI already surfaces them as Moloco creatives.
- The missing piece is asset ingestion, not reporting data.
- `src/hooks/useMultiPlatformCreatives.ts` already reads creative assets from the shared `creative_assets` table for any platform, including `moloco`.
- But `supabase/functions/fetch-creative-assets/index.ts` only processes `meta` and `snapchat`. There is no Moloco branch at all.
- The manual sync control in `src/pages/Controls.tsx` is also hardcoded to `platforms: ['meta']`, which reinforces that Moloco assets were never wired up.
- The current “fetch missing thumbnails” flow in `src/components/reporting/CreativePerformanceGrid.tsx` is explicitly Meta-only.

Implementation plan

1. Add Moloco asset fetch support in the asset sync function
- Extend `supabase/functions/fetch-creative-assets/index.ts` with a new Moloco fetch pipeline.
- Use the existing Moloco auth flow pattern already present in `moloco-history`.
- Query Moloco creative/creative-group endpoints to retrieve:
  - creative or creative-group ID
  - name/title
  - image/video asset URL(s) or preview URL(s)
  - asset type where available
- Normalize the response into the same shape already used for Meta/Snapchat so the rest of the function can reuse existing download/store/upsert logic.

2. Map Moloco assets to reporting creatives reliably
- Use the Moloco creative/ad-group naming already returned by `moloco-history` and align it with the asset records saved into `creative_assets`.
- Prefer a stable Moloco platform creative ID for `platform_creative_id`.
- Keep `creative_name` aligned with the ad-group title used in reporting so `useMultiPlatformCreatives` can match assets immediately without extra backend changes.

3. Store Moloco assets in the existing shared asset table/bucket
- Reuse the existing `creative-assets` bucket and `creative_assets` table.
- Save Moloco assets with:
  - `platform: 'moloco'`
  - `thumbnail_url`
  - `full_asset_url` when available
  - `poster_url` for videos if available
  - `original_url`
  - `asset_type`
  - `platform_creative_id`
- Use a Moloco-specific storage path like `moloco/<concept>/<id>...` to keep assets organized.

4. Enable Moloco asset sync from the app
- Update `src/pages/Controls.tsx` so the repopulate action can include Moloco, instead of only Meta.
- Update the user-facing labels so it’s clear the asset sync supports Moloco too.
- Optionally support syncing both platforms in one run while still allowing targeted platform syncs.

5. Let the reporting UI fetch missing Moloco assets too
- Update `src/components/reporting/CreativePerformanceGrid.tsx` so the “fetch missing thumbnails” action is not Meta-only.
- Split the missing creatives by platform and invoke the correct backend sync path for Moloco assets as well.
- Keep Meta-specific fallback behavior only where it truly depends on Meta APIs.

6. Keep the preview dialog platform-aware
- Do not reuse the Meta ad preview iframe for Moloco.
- For Moloco creatives, default to the stored image/video asset in `CreativePreviewDialog`.
- If Moloco provides only image assets, show those directly; if video/poster is available, reuse the existing video player path.

Technical details
```text
Current state
Moloco reporting data -> yes
Moloco assets in creative_assets -> no
Moloco asset sync branch -> missing

Target flow
Moloco API -> fetch creative/creative-group assets
          -> download to creative-assets bucket
          -> upsert creative_assets rows (platform='moloco')
          -> useMultiPlatformCreatives resolves assetUrl
          -> reporting grid + dialog show Moloco media
```

Files to update
- `supabase/functions/fetch-creative-assets/index.ts`
- `src/pages/Controls.tsx`
- `src/components/reporting/CreativePerformanceGrid.tsx`
- Possibly `src/components/reporting/CreativePreviewDialog.tsx` for cleaner Moloco defaults

Notes / risk
- The biggest unknown is the exact Moloco endpoint/field combination for downloadable creative media URLs. Before implementation, I would inspect the Moloco creative/creative-group response shape and wire to the best available asset URL fields.
- No database migration should be needed unless Moloco requires storing extra identifiers beyond the current schema.
