import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

interface AdMetric {
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  installs: number;
  cpi: number;
}

export interface EnrichedCreative {
  adId: string;
  adName: string;
  spend: number;
  installs: number;
  ctr: number;
  cpi: number;
  parsed: ParsedCreativeName;
}

export function useCreativePerformance() {
  const [data, setData] = useState<EnrichedCreative[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCreatives = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: invokeError } = await supabase.functions.invoke("meta-history", {
        body: { startDate, endDate },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (!responseData?.success) {
        throw new Error(responseData?.error || "Failed to fetch creative data");
      }

      const ads: AdMetric[] = responseData.data?.ads || [];

      // Enrich each ad with parsed naming convention data
      const enrichedCreatives: EnrichedCreative[] = ads.map((ad) => ({
        adId: ad.ad_id,
        adName: ad.ad_name,
        spend: ad.spend,
        installs: ad.installs,
        ctr: ad.ctr,
        cpi: ad.cpi,
        parsed: parseCreativeName(ad.ad_name),
      }));

      // Sort by spend descending and take top 25
      const sortedCreatives = enrichedCreatives
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 25);

      setData(sortedCreatives);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setData([]);
    setError(null);
  }, []);

  return {
    data,
    isLoading,
    error,
    fetchCreatives,
    clearData,
  };
}
