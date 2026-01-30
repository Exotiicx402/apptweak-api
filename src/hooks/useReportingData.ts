import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PlatformMetrics {
  spend: number;
  installs: number;
  cpi: number;
  isLoading: boolean;
  error: string | null;
}

interface ReportingData {
  meta: PlatformMetrics;
  snapchat: PlatformMetrics;
  unity: PlatformMetrics;
  googleAds: PlatformMetrics;
  tiktok: PlatformMetrics;
  moloco: PlatformMetrics;
  totals: {
    spend: number;
    installs: number;
    cpi: number;
  };
}

const emptyMetrics: PlatformMetrics = {
  spend: 0,
  installs: 0,
  cpi: 0,
  isLoading: false,
  error: null,
};

export function useReportingData() {
  const [data, setData] = useState<ReportingData>({
    meta: { ...emptyMetrics },
    snapchat: { ...emptyMetrics },
    unity: { ...emptyMetrics },
    googleAds: { ...emptyMetrics },
    tiktok: { ...emptyMetrics },
    moloco: { ...emptyMetrics },
    totals: { spend: 0, installs: 0, cpi: 0 },
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchAllPlatforms = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true);
    
    // Set all platforms to loading
    setData(prev => ({
      ...prev,
      meta: { ...emptyMetrics, isLoading: true },
      snapchat: { ...emptyMetrics, isLoading: true },
      unity: { ...emptyMetrics, isLoading: true },
      googleAds: { ...emptyMetrics, isLoading: true },
      tiktok: { ...emptyMetrics, isLoading: true },
      moloco: { ...emptyMetrics, isLoading: true },
    }));

    // Fetch all platforms in parallel
    const [metaResult, snapchatResult, unityResult, googleAdsResult, tiktokResult, molocoResult] = await Promise.allSettled([
      supabase.functions.invoke("meta-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("snapchat-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("unity-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("google-ads-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("tiktok-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("moloco-history", { body: { startDate, endDate } }),
    ]);

    // Process results
    const processResult = (result: PromiseSettledResult<any>): PlatformMetrics => {
      if (result.status === "rejected") {
        return { ...emptyMetrics, error: result.reason?.message || "Failed to fetch" };
      }
      
      const { data: responseData, error } = result.value;
      
      if (error) {
        return { ...emptyMetrics, error: error.message };
      }
      
      if (!responseData?.success) {
        return { ...emptyMetrics, error: responseData?.error || "Failed to fetch" };
      }
      
      const totals = responseData.data?.totals || {};
      return {
        spend: totals.spend || 0,
        installs: totals.installs || 0,
        cpi: totals.cpi || (totals.spend && totals.installs ? totals.spend / totals.installs : 0),
        isLoading: false,
        error: null,
      };
    };

    const meta = processResult(metaResult);
    const snapchat = processResult(snapchatResult);
    const unity = processResult(unityResult);
    const googleAds = processResult(googleAdsResult);
    const tiktok = processResult(tiktokResult);
    const moloco = processResult(molocoResult);

    // Calculate totals (only from platforms without errors)
    const platforms = [meta, snapchat, unity, googleAds, tiktok, moloco];
    const validPlatforms = platforms.filter(p => !p.error);
    
    const totalSpend = validPlatforms.reduce((sum, p) => sum + p.spend, 0);
    const totalInstalls = validPlatforms.reduce((sum, p) => sum + p.installs, 0);
    const blendedCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;

    setData({
      meta,
      snapchat,
      unity,
      googleAds,
      tiktok,
      moloco,
      totals: {
        spend: totalSpend,
        installs: totalInstalls,
        cpi: blendedCpi,
      },
    });

    setIsLoading(false);
  }, []);

  return { data, isLoading, fetchAllPlatforms };
}
