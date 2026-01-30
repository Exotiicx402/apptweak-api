import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PlatformMetrics {
  spend: number;
  installs: number;
  cpi: number;
  previousSpend: number;
  previousInstalls: number;
  previousCpi: number;
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
    previousSpend: number;
    previousInstalls: number;
    previousCpi: number;
  };
}

const emptyMetrics: PlatformMetrics = {
  spend: 0,
  installs: 0,
  cpi: 0,
  previousSpend: 0,
  previousInstalls: 0,
  previousCpi: 0,
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
    totals: { spend: 0, installs: 0, cpi: 0, previousSpend: 0, previousInstalls: 0, previousCpi: 0 },
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

    // Only 6 requests - each endpoint already returns both totals and previousTotals
    const [metaResult, snapchatResult, unityResult, googleAdsResult, tiktokResult, molocoResult] = 
      await Promise.allSettled([
        supabase.functions.invoke("meta-history", { body: { startDate, endDate } }),
        supabase.functions.invoke("snapchat-history", { body: { startDate, endDate } }),
        supabase.functions.invoke("unity-history", { body: { startDate, endDate } }),
        supabase.functions.invoke("google-ads-history", { body: { startDate, endDate } }),
        supabase.functions.invoke("tiktok-history", { body: { startDate, endDate } }),
        supabase.functions.invoke("moloco-history", { body: { startDate, endDate } }),
      ]);

    // Extract both current and previous totals from a single response
    const extractMetrics = (result: PromiseSettledResult<any>): PlatformMetrics => {
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
      const previousTotals = responseData.data?.previousTotals || {};
      
      return {
        spend: totals.spend || 0,
        installs: totals.installs || 0,
        cpi: totals.cpi || (totals.spend && totals.installs ? totals.spend / totals.installs : 0),
        previousSpend: previousTotals.spend || 0,
        previousInstalls: previousTotals.installs || 0,
        previousCpi: previousTotals.cpi || (previousTotals.spend && previousTotals.installs ? previousTotals.spend / previousTotals.installs : 0),
        isLoading: false,
        error: null,
      };
    };

    const meta = extractMetrics(metaResult);
    const snapchat = extractMetrics(snapchatResult);
    const unity = extractMetrics(unityResult);
    const googleAds = extractMetrics(googleAdsResult);
    const tiktok = extractMetrics(tiktokResult);
    const moloco = extractMetrics(molocoResult);

    // Calculate totals (only from platforms without errors)
    const platforms = [meta, snapchat, unity, googleAds, tiktok, moloco];
    const validPlatforms = platforms.filter(p => !p.error);
    
    const totalSpend = validPlatforms.reduce((sum, p) => sum + p.spend, 0);
    const totalInstalls = validPlatforms.reduce((sum, p) => sum + p.installs, 0);
    const previousTotalSpend = validPlatforms.reduce((sum, p) => sum + p.previousSpend, 0);
    const previousTotalInstalls = validPlatforms.reduce((sum, p) => sum + p.previousInstalls, 0);
    
    const blendedCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
    const previousBlendedCpi = previousTotalInstalls > 0 ? previousTotalSpend / previousTotalInstalls : 0;

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
        previousSpend: previousTotalSpend,
        previousInstalls: previousTotalInstalls,
        previousCpi: previousBlendedCpi,
      },
    });

    setIsLoading(false);
  }, []);

  return { data, isLoading, fetchAllPlatforms };
}
