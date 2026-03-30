import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

interface AdMetric {
  ad_id?: string;
  ad_name: string;
  adset_id?: string;
  adset_name?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  installs: number;
  cpi: number;
  registrations?: number;
  ftds?: number;
  trades?: number;
  ftdValue?: number;
  tradeValue?: number;
  cps?: number;
  cftd?: number;
  video3sViews?: number;
  avgWatchTime?: number;
  thumbstopRate?: number;
}

interface CreativeAsset {
  creative_name: string;
  thumbnail_url: string | null;
  asset_type: string | null;
  full_asset_url: string | null;
  poster_url: string | null;
  updated_at: string | null;
  platform_creative_id: string | null;
}

interface AssetSelection {
  url: string | null;
  type: string | null;
  fullAssetUrl: string | null;
  posterUrl: string | null;
  platformCreativeId: string | null;
  updatedAtMs: number;
  hasHostedAsset: boolean;
}

export type Platform = "meta" | "moloco" | "blended";

export interface EnrichedCreative {
  adId: string;
  adName: string;
  adsetId?: string;
  adsetName?: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  ctr: number;
  cpi: number;
  registrations: number;
  ftds: number;
  trades: number;
  ftdValue: number;
  tradeValue: number;
  cps: number;
  cftd: number;
  video3sViews: number;
  avgWatchTime: number;
  thumbstopRate: number;
  platform: string;
  parsed: ParsedCreativeName;
  assetUrl: string | null;
  assetType: string | null;
  fullAssetUrl: string | null;
  posterUrl: string | null;
  originalUrl?: string | null;
  platformCreativeId?: string | null;
  storedUrl?: string | null;
  adData?: any;
}

interface PlatformData {
  ads: AdMetric[];
  isLoading: boolean;
  error: string | null;
}

const canonicalizeCreativeName = (name: string): string =>
  name
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const CREATIVE_ASSET_STORAGE_MARKER = "/storage/v1/object/public/creative-assets/";

const hasHostedCreativeAsset = (value: string | null | undefined): boolean =>
  !!value && value.includes(CREATIVE_ASSET_STORAGE_MARKER);

const shouldPreferAssetSelection = (
  nextAsset: AssetSelection,
  existingAsset: AssetSelection
): boolean => {
  if (nextAsset.hasHostedAsset !== existingAsset.hasHostedAsset) {
    return nextAsset.hasHostedAsset;
  }

  if (!!nextAsset.fullAssetUrl !== !!existingAsset.fullAssetUrl) {
    return !!nextAsset.fullAssetUrl;
  }

  if (!!nextAsset.url !== !!existingAsset.url) {
    return !!nextAsset.url;
  }

  if (!!nextAsset.posterUrl !== !!existingAsset.posterUrl) {
    return !!nextAsset.posterUrl;
  }

  return nextAsset.updatedAtMs > existingAsset.updatedAtMs;
};

export function useMultiPlatformCreatives() {
  const [meta, setMeta] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [moloco, setMoloco] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [assetMap, setAssetMap] = useState<Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null; platformCreativeId: string | null }>>(new Map());
  const [storedUrlMap, setStoredUrlMap] = useState<Map<string, string>>(new Map());
  const [activePlatform, setActivePlatform] = useState<Platform>("meta");

  const fetchPlatform = async (
    platform: string,
    edgeFn: string,
    startDate: string,
    endDate: string,
    setData: (data: PlatformData) => void
  ) => {
    setData({ ads: [], isLoading: true, error: null });

    try {
      const requestBody =
        platform === "moloco" && edgeFn === "moloco-history"
          ? { startDate, endDate, adsOnly: true }
          : { startDate, endDate };

      const { data: responseData, error: invokeError } = await supabase.functions.invoke(edgeFn, {
        body: requestBody,
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (!responseData?.success) {
        throw new Error(responseData?.error || `Failed to fetch ${platform} data`);
      }

      const ads: AdMetric[] = responseData.data?.ads || [];
      setData({ ads, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setData({ ads: [], isLoading: false, error: message });
    }
  };

  const fetchCreativeAssets = async () => {
    try {
      const allAssets: CreativeAsset[] = [];
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from('creative_assets')
          .select('creative_name, thumbnail_url, asset_type, full_asset_url, poster_url, updated_at, platform_creative_id')
          .order('updated_at', { ascending: false, nullsFirst: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('Error fetching creative assets:', error);
          return;
        }

        const page = (data as CreativeAsset[]) || [];
        if (page.length === 0) break;

        allAssets.push(...page);

        if (page.length < pageSize) break;
        from += pageSize;
      }

      const selectedAssets = new Map<string, AssetSelection>();
      for (const asset of allAssets) {
        const canonicalName = canonicalizeCreativeName(asset.creative_name);

        // Add cache-busting query param based on updated_at
        const cacheBust = asset.updated_at ? `?v=${new Date(asset.updated_at).getTime()}` : '';

        const thumbnailWithCache = asset.thumbnail_url ? asset.thumbnail_url + cacheBust : null;
        const fullWithCache = asset.full_asset_url ? asset.full_asset_url + cacheBust : null;
        const posterWithCache = asset.poster_url ? asset.poster_url + cacheBust : null;

        const updatedAtMs = asset.updated_at ? new Date(asset.updated_at).getTime() : 0;

        const nextAsset: AssetSelection = {
          url: thumbnailWithCache || posterWithCache,
          type: asset.asset_type,
          fullAssetUrl: fullWithCache,
          posterUrl: posterWithCache || thumbnailWithCache,
          platformCreativeId: asset.platform_creative_id,
          updatedAtMs,
          hasHostedAsset:
            hasHostedCreativeAsset(asset.thumbnail_url) ||
            hasHostedCreativeAsset(asset.full_asset_url) ||
            hasHostedCreativeAsset(asset.poster_url),
        };

        const existing = selectedAssets.get(canonicalName);
        const shouldReplace = !existing || shouldPreferAssetSelection(nextAsset, existing);

        if (shouldReplace) {
          selectedAssets.set(canonicalName, nextAsset);
        }
      }

      const map = new Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null; platformCreativeId: string | null }>();
      for (const [name, selected] of selectedAssets.entries()) {
        map.set(name, {
          url: selected.url,
          type: selected.type,
          fullAssetUrl: selected.fullAssetUrl,
          posterUrl: selected.posterUrl,
          platformCreativeId: selected.platformCreativeId,
        });
      }

      setAssetMap(map);
    } catch (err) {
      console.error('Error fetching creative assets:', err);
    }
  };

  const fetchStoredAssets = async () => {
    try {
      const { data, error } = await supabase
        .from('processed_creative_assets')
        .select('creative_id, stored_url');
      if (error) { console.error('Error fetching stored assets:', error); return; }
      const map = new Map<string, string>();
      for (const row of data || []) {
        if (row.stored_url) map.set(row.creative_id, row.stored_url);
      }
      setStoredUrlMap(map);
    } catch (err) {
      console.error('Error fetching stored assets:', err);
    }
  };

  const fetchAllPlatforms = useCallback(async (startDate: string, endDate: string) => {
    // Fetch all platforms and assets in parallel
    await Promise.all([
      fetchPlatform("meta", "meta-history", startDate, endDate, setMeta),
      fetchPlatform("moloco", "moloco-history", startDate, endDate, setMoloco),
      fetchCreativeAssets(),
      fetchStoredAssets(),
    ]);
  }, []);

  const clearData = useCallback(() => {
    setMeta({ ads: [], isLoading: false, error: null });
    setMoloco({ ads: [], isLoading: false, error: null });
  }, []);

  // Enrich ads with parsed naming convention data
  const enrichAds = useCallback((ads: AdMetric[], platform: string): EnrichedCreative[] => {
    return ads.map((ad) => {
      const canonicalName = canonicalizeCreativeName(ad.ad_name);
      const asset = assetMap.get(canonicalName);
      const adId = ad.ad_id || ad.ad_name;
      const stored = storedUrlMap.get(adId);
      const impressions = ad.impressions || 0;
      const clicks = ad.clicks || 0;
      const video3sViews = ad.video3sViews || 0;
      // Priority waterfall: stored URL > asset URL
      const resolvedAssetUrl = stored || asset?.url || null;
      return {
      adId,
      adName: ad.ad_name,
      adsetId: ad.adset_id,
      adsetName: ad.adset_name,
      spend: ad.spend,
      impressions,
      clicks,
      installs: ad.installs,
      ctr: impressions > 0 ? clicks / impressions : ad.ctr,
      cpi: ad.cpi,
      registrations: ad.registrations || 0,
      ftds: ad.ftds || 0,
      trades: ad.trades || 0,
      ftdValue: ad.ftdValue || 0,
      tradeValue: ad.tradeValue || 0,
      cps: ad.cps || 0,
      cftd: ad.cftd || 0,
      video3sViews,
      avgWatchTime: ad.avgWatchTime || 0,
      thumbstopRate: ad.thumbstopRate || (impressions > 0 ? video3sViews / impressions : 0),
      platform,
      parsed: parseCreativeName(ad.ad_name),
        assetUrl: resolvedAssetUrl,
        assetType: asset?.type || null,
        fullAssetUrl: asset?.fullAssetUrl || null,
        posterUrl: asset?.posterUrl || null,
        platformCreativeId: asset?.platformCreativeId || null,
        storedUrl: stored || null,
      };
    });
  }, [assetMap, storedUrlMap]);

  // Aggregate creatives with the same ad name (including cross-adset rollups)
  const aggregateCreativesByName = (creatives: EnrichedCreative[]): EnrichedCreative[] => {
    const grouped = new Map<string, EnrichedCreative>();
    const watchTimeSums = new Map<string, { weightedSum: number; weight: number }>();
    const platformSets = new Map<string, Set<string>>();

    for (const creative of creatives) {
      const key = canonicalizeCreativeName(creative.adName);
      const existing = grouped.get(key);

      const weight = Math.max(creative.video3sViews, creative.impressions, 1);
      const existingWatch = watchTimeSums.get(key) || { weightedSum: 0, weight: 0 };
      existingWatch.weightedSum += creative.avgWatchTime * weight;
      existingWatch.weight += weight;
      watchTimeSums.set(key, existingWatch);

      const existingPlatforms = platformSets.get(key) || new Set<string>();
      existingPlatforms.add(creative.platform);
      platformSets.set(key, existingPlatforms);

      if (existing) {
        // Aggregate metrics
        existing.spend += creative.spend;
        existing.impressions += creative.impressions;
        existing.clicks += creative.clicks;
        existing.installs += creative.installs;
        existing.registrations += creative.registrations;
        existing.ftds += creative.ftds;
        existing.trades += creative.trades;
        existing.ftdValue += creative.ftdValue;
        existing.tradeValue += creative.tradeValue;
        existing.video3sViews += creative.video3sViews;
        existing.ctr = existing.impressions > 0 ? existing.clicks / existing.impressions : 0;
        existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        existing.cps = existing.registrations > 0 ? existing.spend / existing.registrations : 0;
        existing.cftd = existing.ftds > 0 ? existing.spend / existing.ftds : 0;
        existing.thumbstopRate = existing.impressions > 0 ? existing.video3sViews / existing.impressions : 0;
        // Fill in missing asset URL from any variant that has one
        if (!existing.assetUrl && creative.assetUrl) {
          existing.assetUrl = creative.assetUrl;
          existing.assetType = creative.assetType;
          existing.fullAssetUrl = creative.fullAssetUrl;
          existing.posterUrl = creative.posterUrl;
          existing.storedUrl = creative.storedUrl;
          existing.adData = creative.adData;
        }
      } else {
        grouped.set(key, { ...creative });
      }
    }

    return Array.from(grouped.entries()).map(([key, creative]) => {
      const watch = watchTimeSums.get(key);
      const platforms = platformSets.get(key);
      return {
        ...creative,
        avgWatchTime: watch && watch.weight > 0 ? watch.weightedSum / watch.weight : 0,
        platform: platforms && platforms.size > 1 ? "blended" : creative.platform,
      };
    });
  };

  // Keep raw (per-adset) enriched ads for drill-down
  const rawMetaAds = useMemo(() => enrichAds(meta.ads, "meta"), [meta.ads, enrichAds]);
  const rawMolocoAds = useMemo(() => enrichAds(moloco.ads, "moloco"), [moloco.ads, enrichAds]);

  // Memoize enriched + aggregated ads to prevent recalculation on every render
  const metaAds = useMemo(() => aggregateCreativesByName(rawMetaAds), [rawMetaAds]);
  const molocoAds = useMemo(() => aggregateCreativesByName(rawMolocoAds), [rawMolocoAds]);

  // All enriched ads by platform (for drill-down)
  const allEnrichedByPlatform = useMemo(() => ({
    meta: metaAds,
    moloco: molocoAds,
  }), [metaAds, molocoAds]);

  // Get platform breakdown for a specific creative name
  const getPlatformBreakdown = useCallback((adName: string): EnrichedCreative[] => {
    const breakdown: EnrichedCreative[] = [];

    for (const ad of metaAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    for (const ad of molocoAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }

    return breakdown.sort((a, b) => b.spend - a.spend);
  }, [metaAds, molocoAds]);

  // Get adset breakdown for a specific creative (pre-aggregation rows)
  const getAdsetBreakdown = useCallback((adName: string): EnrichedCreative[] => {
    const breakdown: EnrichedCreative[] = [];

    for (const ad of rawMetaAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    for (const ad of rawMolocoAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }

    return breakdown.sort((a, b) => b.spend - a.spend);
  }, [rawMetaAds, rawMolocoAds]);

  // Get filtered/processed creatives based on active platform
  const data = useMemo((): EnrichedCreative[] => {
    let result: EnrichedCreative[] = [];

    switch (activePlatform) {
      case "meta":
        result = metaAds;
        break;
      case "moloco":
        result = molocoAds;
        break;
      case "blended":
      default:
        const all = [...metaAds, ...molocoAds];
        result = aggregateCreativesByName(all);
        break;
    }

    // Sort by spend descending
    return result.sort((a, b) => b.spend - a.spend);
  }, [metaAds, molocoAds, activePlatform]);

  const isLoading = meta.isLoading || moloco.isLoading;

  // Check if a specific platform has ad-level data available
  const hasAdData = {
    meta: meta.ads.length > 0,
    moloco: moloco.ads.length > 0,
  };

  // Get errors from any platform
  const errors: string[] = [
    meta.error,
    moloco.error,
  ].filter((e): e is string => e !== null);

  return {
    data,
    isLoading,
    errors,
    activePlatform,
    setActivePlatform,
    fetchAllPlatforms,
    clearData,
    hasAdData,
    platformCounts: {
      meta: metaAds.length,
      moloco: molocoAds.length,
    },
    getPlatformBreakdown,
    getAdsetBreakdown,
    allEnrichedByPlatform,
  };
}
