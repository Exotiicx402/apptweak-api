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
}

export type Platform = "meta" | "moloco" | "blended";

export interface EnrichedCreative {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
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
}

interface PlatformData {
  ads: AdMetric[];
  isLoading: boolean;
  error: string | null;
}

export function useMultiPlatformCreatives() {
  const [meta, setMeta] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [moloco, setMoloco] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [assetMap, setAssetMap] = useState<Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null }>>(new Map());
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
        .select('creative_name, thumbnail_url, asset_type, full_asset_url, poster_url, updated_at');

      if (error) {
        console.error('Error fetching creative assets:', error);
        return;
      }

      const map = new Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null }>();
      for (const asset of (data as CreativeAsset[]) || []) {
        // Add cache-busting query param based on updated_at
        const cacheBust = asset.updated_at ? `?v=${new Date(asset.updated_at).getTime()}` : '';
        
        // For grid display: use thumbnail (which should be the poster for videos, or full image)
        // For preview: use full_asset_url (which is the MP4 for videos, or full image)
        const thumbnailWithCache = asset.thumbnail_url ? asset.thumbnail_url + cacheBust : null;
        const fullWithCache = asset.full_asset_url ? asset.full_asset_url + cacheBust : null;
        const posterWithCache = asset.poster_url ? asset.poster_url + cacheBust : null;
        
        map.set(asset.creative_name, {
          // For card display: prefer thumbnail (poster for videos), never show an MP4 URL here
          url: thumbnailWithCache || posterWithCache,
          type: asset.asset_type,
          fullAssetUrl: fullWithCache,
          posterUrl: posterWithCache || thumbnailWithCache,
        });
      }
      setAssetMap(map);
    } catch (err) {
      console.error('Error fetching creative assets:', err);
    }
  };

  const fetchAllPlatforms = useCallback(async (startDate: string, endDate: string) => {
    // Fetch all platforms and assets in parallel
    await Promise.all([
      fetchPlatform("meta", "meta-history", startDate, endDate, setMeta),
      fetchPlatform("moloco", "moloco-history", startDate, endDate, setMoloco),
      fetchCreativeAssets(),
    ]);
  }, []);

  const clearData = useCallback(() => {
    setMeta({ ads: [], isLoading: false, error: null });
  }, []);

  // Enrich ads with parsed naming convention data
  const enrichAds = useCallback((ads: AdMetric[], platform: string): EnrichedCreative[] => {
    return ads.map((ad) => {
      const asset = assetMap.get(ad.ad_name);
      const impressions = ad.impressions || 0;
      const video3sViews = ad.video3sViews || 0;
      return {
      adId: ad.ad_id || ad.ad_name,
      adName: ad.ad_name,
      spend: ad.spend,
      impressions,
      installs: ad.installs,
      ctr: ad.ctr,
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
        assetUrl: asset?.url || null,
        assetType: asset?.type || null,
        fullAssetUrl: asset?.fullAssetUrl || null,
        posterUrl: asset?.posterUrl || null,
      };
    });
  }, [assetMap]);

  // Blend creatives with the same name across platforms
  const blendCreatives = (creatives: EnrichedCreative[]): EnrichedCreative[] => {
    const grouped = new Map<string, EnrichedCreative>();

    for (const creative of creatives) {
      const key = creative.adName;
      const existing = grouped.get(key);

    if (existing) {
        // Aggregate metrics
        existing.spend += creative.spend;
        existing.impressions += creative.impressions;
        existing.installs += creative.installs;
        existing.registrations += creative.registrations;
        existing.ftds += creative.ftds;
        existing.trades += creative.trades;
        existing.ftdValue += creative.ftdValue;
        existing.tradeValue += creative.tradeValue;
        existing.video3sViews += creative.video3sViews;
        existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        existing.cps = existing.registrations > 0 ? existing.spend / existing.registrations : 0;
        existing.cftd = existing.ftds > 0 ? existing.spend / existing.ftds : 0;
        existing.thumbstopRate = existing.impressions > 0 ? existing.video3sViews / existing.impressions : 0;
        // Weighted avg watch time
        existing.avgWatchTime = (existing.avgWatchTime + creative.avgWatchTime) / 2;
        // Weighted CTR (by impressions would be ideal, but we use spend as proxy)
        existing.ctr = (existing.ctr + creative.ctr) / 2;
        // Mark as truly blended only when multiple platforms contribute
        existing.platform = "blended";
      } else {
        // Keep original platform — only mark as "blended" if aggregated later
        grouped.set(key, { ...creative });
      }
    }

    return Array.from(grouped.values());
  };

  // Memoize enriched ads to prevent recalculation on every render
  const metaAds = useMemo(() => enrichAds(meta.ads, "meta"), [meta.ads, enrichAds]);

  // All enriched ads by platform (for drill-down)
  const allEnrichedByPlatform = useMemo(() => ({
    meta: metaAds,
  }), [metaAds]);

  // Get platform breakdown for a specific creative name
  const getPlatformBreakdown = useCallback((adName: string): EnrichedCreative[] => {
    const breakdown: EnrichedCreative[] = [];
    
    for (const ad of metaAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    
    return breakdown.sort((a, b) => b.spend - a.spend);
  }, [metaAds]);

  // Get filtered/processed creatives based on active platform
  const data = useMemo((): EnrichedCreative[] => {
    let result: EnrichedCreative[] = [];

    switch (activePlatform) {
      case "meta":
        result = metaAds;
        break;
      case "blended":
      default:
        const all = [...metaAds];
        result = blendCreatives(all);
        break;
    }

    // Sort by spend descending
    return result.sort((a, b) => b.spend - a.spend);
  }, [metaAds, activePlatform]);

  const isLoading = meta.isLoading;

  // Check if a specific platform has ad-level data available
  const hasAdData = {
    meta: meta.ads.length > 0,
  };

  // Get errors from any platform
  const errors: string[] = [
    meta.error,
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
      meta: meta.ads.length,
    },
    getPlatformBreakdown,
    allEnrichedByPlatform,
  };
}
