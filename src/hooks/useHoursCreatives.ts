import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

interface AdMetric {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  installs: number;
  cpi: number;
  image_url: string | null;
}

interface CreativeAsset {
  creative_name: string;
  thumbnail_url: string | null;
  asset_type: string | null;
  full_asset_url: string | null;
  poster_url: string | null;
  updated_at: string | null;
}

export interface HoursCreative {
  adId: string;
  adName: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  ctr: number;
  cpi: number;
  parsed: ParsedCreativeName;
  assetUrl: string | null;
  assetType: string | null;
  fullAssetUrl: string | null;
  posterUrl: string | null;
}

export function useHoursCreatives() {
  const [ads, setAds] = useState<AdMetric[]>([]);
  const [assetMap, setAssetMap] = useState<Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null }>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const [edgeResult, assetsResult] = await Promise.all([
        supabase.functions.invoke("meta-hours-creatives", {
          body: { startDate, endDate, campaignKeyword: "hours" },
        }),
        supabase.from("creative_assets").select("creative_name, thumbnail_url, asset_type, full_asset_url, poster_url, updated_at"),
      ]);

      if (edgeResult.error) throw new Error(edgeResult.error.message);
      if (!edgeResult.data?.success) throw new Error(edgeResult.data?.error || "Failed to fetch");

      setAds(edgeResult.data.data.ads || []);

      // Build asset map
      const map = new Map<string, { url: string | null; type: string | null; fullAssetUrl: string | null; posterUrl: string | null }>();
      for (const asset of (assetsResult.data as CreativeAsset[]) || []) {
        const cacheBust = asset.updated_at ? `?v=${new Date(asset.updated_at).getTime()}` : "";
        const thumbnailWithCache = asset.thumbnail_url ? asset.thumbnail_url + cacheBust : null;
        const fullWithCache = asset.full_asset_url ? asset.full_asset_url + cacheBust : null;
        const posterWithCache = asset.poster_url ? asset.poster_url + cacheBust : null;
        map.set(asset.creative_name, {
          url: thumbnailWithCache || posterWithCache,
          type: asset.asset_type,
          fullAssetUrl: fullWithCache,
          posterUrl: posterWithCache || thumbnailWithCache,
        });
      }
      setAssetMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setAds([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const data: HoursCreative[] = useMemo(() => {
    return ads.map((ad) => {
      const asset = assetMap.get(ad.ad_name);
      // Prefer API image_url (high-res from Meta), then creative_assets DB, then null
      const apiImageUrl = ad.image_url || null;
      const dbThumbnail = asset?.url || null;
      const dbFullAsset = asset?.fullAssetUrl || null;
      
      return {
        adId: ad.ad_id,
        adName: ad.ad_name,
        campaignName: ad.campaign_name,
        spend: ad.spend,
        impressions: ad.impressions,
        clicks: ad.clicks,
        installs: ad.installs,
        ctr: ad.ctr,
        cpi: ad.cpi,
        parsed: parseCreativeName(ad.ad_name),
        assetUrl: dbThumbnail || apiImageUrl,
        assetType: asset?.type || "image",
        fullAssetUrl: dbFullAsset || apiImageUrl,
        posterUrl: asset?.posterUrl || null,
      };
    });
  }, [ads, assetMap]);

  return { data, isLoading, error, fetchData };
}
