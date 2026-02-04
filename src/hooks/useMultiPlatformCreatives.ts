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

  const fetchAllPlatforms = useCallback(async (startDate: string, endDate: string) => {
    // Fetch all platforms in parallel
    await Promise.all([
      fetchPlatform("meta", "meta-history", startDate, endDate, setMeta),
      fetchPlatform("snapchat", "snapchat-history", startDate, endDate, setSnapchat),
      fetchPlatform("tiktok", "tiktok-history", startDate, endDate, setTiktok),
      fetchPlatform("google", "google-ads-history", startDate, endDate, setGoogle),
    ]);
  }, []);

  const clearData = useCallback(() => {
    setMeta({ ads: [], isLoading: false, error: null });
    setSnapchat({ ads: [], isLoading: false, error: null });
    setTiktok({ ads: [], isLoading: false, error: null });
    setGoogle({ ads: [], isLoading: false, error: null });
  }, []);

  // Enrich ads with parsed naming convention data
  const enrichAds = (ads: AdMetric[], platform: string): EnrichedCreative[] => {
    return ads.map((ad) => ({
      adId: ad.ad_id || ad.ad_name, // Use ad_name as fallback ID if ad_id not available
      adName: ad.ad_name,
      spend: ad.spend,
      installs: ad.installs,
      ctr: ad.ctr,
      cpi: ad.cpi,
      platform,
      parsed: parseCreativeName(ad.ad_name),
    }));
  };

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
  const metaAds = useMemo(() => enrichAds(meta.ads, "meta"), [meta.ads]);
  const snapchatAds = useMemo(() => enrichAds(snapchat.ads, "snapchat"), [snapchat.ads]);
  const tiktokAds = useMemo(() => enrichAds(tiktok.ads, "tiktok"), [tiktok.ads]);
  const googleAds = useMemo(() => enrichAds(google.ads, "google"), [google.ads]);

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
  };
}
