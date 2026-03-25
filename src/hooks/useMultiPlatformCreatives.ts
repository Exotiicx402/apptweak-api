import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

interface AdMetric {
  ad_id?: string;
  ad_name: string;
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

export type Platform = "meta" | "moloco" | "blended";

export interface EnrichedCreative {
  adId: string;
  adName: string;
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
      const { data: responseData, error: invokeError } = await supabase.functions.invoke(edgeFn, {
        body: { startDate, endDate },
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
      const { data, error } = await supabase
        .from('creative_assets')
        .select('creative_name, thumbnail_url, asset_type, full_asset_url, poster_url, updated_at, platform_creative_id');

      if (error) {
        console.error('Error fetching creative assets:', error);
        return;
      }

      const map = new Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null; platformCreativeId: string | null }>();
      for (const asset of (data as CreativeAsset[]) || []) {
        // Add cache-busting query param based on updated_at
        const cacheBust = asset.updated_at ? `?v=${new Date(asset.updated_at).getTime()}` : '';
        
        const thumbnailWithCache = asset.thumbnail_url ? asset.thumbnail_url + cacheBust : null;
        const fullWithCache = asset.full_asset_url ? asset.full_asset_url + cacheBust : null;
        const posterWithCache = asset.poster_url ? asset.poster_url + cacheBust : null;
        
        map.set(asset.creative_name, {
          url: thumbnailWithCache || posterWithCache,
          type: asset.asset_type,
          fullAssetUrl: fullWithCache,
          posterUrl: posterWithCache || thumbnailWithCache,
          platformCreativeId: asset.platform_creative_id,
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

  const normalizeCreativeName = (name: string): string => name.trim().toLowerCase();

  // Enrich ads with parsed naming convention data
  const enrichAds = useCallback((ads: AdMetric[], platform: string): EnrichedCreative[] => {
    return ads.map((ad) => {
      const asset = assetMap.get(ad.ad_name);
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
      const key = normalizeCreativeName(creative.adName);
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

  // Memoize enriched + aggregated ads to prevent recalculation on every render
  const metaAds = useMemo(() => aggregateCreativesByName(enrichAds(meta.ads, "meta")), [meta.ads, enrichAds]);
  const molocoAds = useMemo(() => aggregateCreativesByName(enrichAds(moloco.ads, "moloco")), [moloco.ads, enrichAds]);

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
    allEnrichedByPlatform,
  };
}
