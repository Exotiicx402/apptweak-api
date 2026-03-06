import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

export type CampaignType = "install" | "waitlist" | "ftd";

interface AdMetric {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  campaign_type: CampaignType;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  installs: number;
  cpi: number;
  sign_ups: number;
  cost_per_sign_up: number;
  ftds: number;
  cost_per_ftd: number;
  image_url: string | null;
}

export interface HoursCreative {
  adId: string;
  adName: string;
  campaignName: string;
  campaignType: CampaignType;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  ctr: number;
  cpi: number;
  signUps: number;
  costPerSignUp: number;
  ftds: number;
  costPerFtd: number;
  parsed: ParsedCreativeName;
  assetUrl: string | null;
  assetType: string | null;
  fullAssetUrl: string | null;
  posterUrl: string | null;
  originalUrl: string | null;
}

export function useHoursCreatives() {
  const [ads, setAds] = useState<AdMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const edgeResult = await supabase.functions.invoke("meta-hours-creatives", {
        body: { startDate, endDate, campaignKeyword: "hours" },
      });

      if (edgeResult.error) throw new Error(edgeResult.error.message);
      if (!edgeResult.data?.success) throw new Error(edgeResult.data?.error || "Failed to fetch");

      setAds(edgeResult.data.data.ads || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setAds([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const data: HoursCreative[] = useMemo(() => {
    const seen = new Set<string>();
    return ads
      .filter((ad) => {
        if (seen.has(ad.ad_id)) return false;
        seen.add(ad.ad_id);
        return true;
      })
      .map((ad) => {
        const imageUrl = ad.image_url || null;

        return {
          adId: ad.ad_id,
          adName: ad.ad_name,
          campaignName: ad.campaign_name,
          campaignType: ad.campaign_type || "install",
          spend: ad.spend,
          impressions: ad.impressions,
          clicks: ad.clicks,
          installs: ad.installs,
          ctr: ad.ctr,
          cpi: ad.cpi,
          signUps: ad.sign_ups || 0,
          costPerSignUp: ad.cost_per_sign_up || 0,
          ftds: ad.ftds || 0,
          costPerFtd: ad.cost_per_ftd || 0,
          parsed: parseCreativeName(ad.ad_name),
          assetUrl: imageUrl,
          assetType: "image",
          fullAssetUrl: imageUrl,
          posterUrl: null,
          originalUrl: imageUrl,
        };
      });
  }, [ads]);

  return { data, isLoading, error, fetchData };
}
