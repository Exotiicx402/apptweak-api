import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

interface AdMetric {
  ad_id?: string; // Optional - some platforms (TikTok) don't have ad_id
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  installs: number;
  cpi: number;
}

interface CreativeAsset {
  creative_name: string;
  thumbnail_url: string | null;
  asset_type: string | null;
  full_asset_url: string | null;
  poster_url: string | null;
}

export type Platform = "meta" | "snapchat" | "tiktok" | "google" | "blended";

export interface EnrichedCreative {
  adId: string;
  adName: string;
  spend: number;
  installs: number;
  ctr: number;
  cpi: number;
  platform: string;
  parsed: ParsedCreativeName;
  assetUrl: string | null;
  assetType: string | null;
  fullAssetUrl: string | null;
  posterUrl: string | null;
}

interface PlatformData {
  ads: AdMetric[];
  isLoading: boolean;
  error: string | null;
}

export function useMultiPlatformCreatives() {
  const [meta, setMeta] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [snapchat, setSnapchat] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [tiktok, setTiktok] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [google, setGoogle] = useState<PlatformData>({ ads: [], isLoading: false, error: null });
  const [assetMap, setAssetMap] = useState<Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null }>>(new Map());
  const [activePlatform, setActivePlatform] = useState<Platform>("blended"); // Default to blended

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
        .select('creative_name, thumbnail_url, asset_type, full_asset_url, poster_url');

      if (error) {
        console.error('Error fetching creative assets:', error);
        return;
      }

      const map = new Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null }>();
      for (const asset of (data as CreativeAsset[]) || []) {
        map.set(asset.creative_name, {
          url: asset.full_asset_url || asset.thumbnail_url,
          type: asset.asset_type,
          fullAssetUrl: asset.full_asset_url,
          posterUrl: asset.poster_url,
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
      fetchPlatform("snapchat", "snapchat-history", startDate, endDate, setSnapchat),
      fetchPlatform("tiktok", "tiktok-history", startDate, endDate, setTiktok),
      fetchPlatform("google", "google-ads-history", startDate, endDate, setGoogle),
      fetchCreativeAssets(),
    ]);
  }, []);

  const clearData = useCallback(() => {
    setMeta({ ads: [], isLoading: false, error: null });
    setSnapchat({ ads: [], isLoading: false, error: null });
    setTiktok({ ads: [], isLoading: false, error: null });
    setGoogle({ ads: [], isLoading: false, error: null });
  }, []);

  // Enrich ads with parsed naming convention data
  const enrichAds = useCallback((ads: AdMetric[], platform: string): EnrichedCreative[] => {
    return ads.map((ad) => {
      const asset = assetMap.get(ad.ad_name);
      return {
      adId: ad.ad_id || ad.ad_name, // Use ad_name as fallback ID if ad_id not available
      adName: ad.ad_name,
      spend: ad.spend,
      installs: ad.installs,
      ctr: ad.ctr,
      cpi: ad.cpi,
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
        existing.installs += creative.installs;
        existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        // Weighted CTR (by impressions would be ideal, but we use spend as proxy)
        existing.ctr = (existing.ctr + creative.ctr) / 2;
        existing.platform = "blended";
      } else {
        grouped.set(key, { ...creative, platform: "blended" });
      }
    }

    return Array.from(grouped.values());
  };

  // Memoize enriched ads to prevent recalculation on every render
  const metaAds = useMemo(() => enrichAds(meta.ads, "meta"), [meta.ads, enrichAds]);
  const snapchatAds = useMemo(() => enrichAds(snapchat.ads, "snapchat"), [snapchat.ads, enrichAds]);
  const tiktokAds = useMemo(() => enrichAds(tiktok.ads, "tiktok"), [tiktok.ads, enrichAds]);
  const googleAds = useMemo(() => enrichAds(google.ads, "google"), [google.ads, enrichAds]);

  // All enriched ads by platform (for drill-down)
  const allEnrichedByPlatform = useMemo(() => ({
    meta: metaAds,
    snapchat: snapchatAds,
    tiktok: tiktokAds,
    google: googleAds,
  }), [metaAds, snapchatAds, tiktokAds, googleAds]);

  // Get platform breakdown for a specific creative name
  const getPlatformBreakdown = useCallback((adName: string): EnrichedCreative[] => {
    const breakdown: EnrichedCreative[] = [];
    
    for (const ad of metaAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    for (const ad of snapchatAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    for (const ad of tiktokAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    for (const ad of googleAds) {
      if (ad.adName === adName) breakdown.push(ad);
    }
    
    return breakdown.sort((a, b) => b.spend - a.spend);
  }, [metaAds, snapchatAds, tiktokAds, googleAds]);

  // Get filtered/processed creatives based on active platform
  const data = useMemo((): EnrichedCreative[] => {
    let result: EnrichedCreative[] = [];

    switch (activePlatform) {
      case "meta":
        result = metaAds;
        break;
      case "snapchat":
        result = snapchatAds;
        break;
      case "tiktok":
        result = tiktokAds;
        break;
      case "google":
        result = googleAds;
        break;
      case "blended":
      default:
        const all = [...metaAds, ...snapchatAds, ...tiktokAds, ...googleAds];
        result = blendCreatives(all);
        break;
    }

    // Sort by spend descending and limit to top 50
    return result.sort((a, b) => b.spend - a.spend).slice(0, 50);
  }, [metaAds, snapchatAds, tiktokAds, googleAds, activePlatform]);

  const isLoading = meta.isLoading || snapchat.isLoading || tiktok.isLoading || google.isLoading;

  // Check if a specific platform has ad-level data available
  const hasAdData = {
    meta: meta.ads.length > 0,
    snapchat: snapchat.ads.length > 0,
    tiktok: tiktok.ads.length > 0,
    google: google.ads.length > 0,
  };

  // Get errors from any platform
  const errors: string[] = [
    meta.error,
    snapchat.error,
    tiktok.error,
    google.error,
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
      snapchat: snapchat.ads.length,
      tiktok: tiktok.ads.length,
      google: google.ads.length,
    },
    getPlatformBreakdown,
    allEnrichedByPlatform,
  };
}
