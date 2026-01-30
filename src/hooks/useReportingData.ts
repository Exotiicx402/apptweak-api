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
    
    // Calculate previous period (same duration before the start date)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1); // Day before start
    const previousStart = new Date(previousEnd.getTime() - durationMs);
    
    const previousStartDate = previousStart.toISOString().split('T')[0];
    const previousEndDate = previousEnd.toISOString().split('T')[0];
    
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

    // Fetch all platforms for both current and previous periods in parallel
    const [
      metaResult, snapchatResult, unityResult, googleAdsResult, tiktokResult, molocoResult,
      prevMetaResult, prevSnapchatResult, prevUnityResult, prevGoogleAdsResult, prevTiktokResult, prevMolocoResult
    ] = await Promise.allSettled([
      supabase.functions.invoke("meta-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("snapchat-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("unity-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("google-ads-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("tiktok-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("moloco-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("meta-history", { body: { startDate: previousStartDate, endDate: previousEndDate } }),
      supabase.functions.invoke("snapchat-history", { body: { startDate: previousStartDate, endDate: previousEndDate } }),
      supabase.functions.invoke("unity-history", { body: { startDate: previousStartDate, endDate: previousEndDate } }),
      supabase.functions.invoke("google-ads-history", { body: { startDate: previousStartDate, endDate: previousEndDate } }),
      supabase.functions.invoke("tiktok-history", { body: { startDate: previousStartDate, endDate: previousEndDate } }),
      supabase.functions.invoke("moloco-history", { body: { startDate: previousStartDate, endDate: previousEndDate } }),
    ]);

    // Extract totals from a result
    const extractTotals = (result: PromiseSettledResult<any>): { spend: number; installs: number; cpi: number; error?: string } => {
      if (result.status === "rejected") {
        return { spend: 0, installs: 0, cpi: 0, error: result.reason?.message || "Failed to fetch" };
      }
      
      const { data: responseData, error } = result.value;
      
      if (error) {
        return { spend: 0, installs: 0, cpi: 0, error: error.message };
      }
      
      if (!responseData?.success) {
        return { spend: 0, installs: 0, cpi: 0, error: responseData?.error || "Failed to fetch" };
      }
      
      const totals = responseData.data?.totals || {};
      return {
        spend: totals.spend || 0,
        installs: totals.installs || 0,
        cpi: totals.cpi || (totals.spend && totals.installs ? totals.spend / totals.installs : 0),
      };
    };

    // Process results for each platform
    const processResults = (
      currentResult: PromiseSettledResult<any>,
      previousResult: PromiseSettledResult<any>
    ): PlatformMetrics => {
      const current = extractTotals(currentResult);
      const previous = extractTotals(previousResult);
      
      return {
        spend: current.spend,
        installs: current.installs,
        cpi: current.cpi,
        previousSpend: previous.spend,
        previousInstalls: previous.installs,
        previousCpi: previous.cpi,
        isLoading: false,
        error: current.error || null,
      };
    };

    const meta = processResults(metaResult, prevMetaResult);
    const snapchat = processResults(snapchatResult, prevSnapchatResult);
    const unity = processResults(unityResult, prevUnityResult);
    const googleAds = processResults(googleAdsResult, prevGoogleAdsResult);
    const tiktok = processResults(tiktokResult, prevTiktokResult);
    const moloco = processResults(molocoResult, prevMolocoResult);

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
