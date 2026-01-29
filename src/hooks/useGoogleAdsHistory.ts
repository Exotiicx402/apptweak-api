import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GoogleAdsHistoryData {
  daily: any[];
  campaigns: any[];
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    installs: number;
    cpi: number;
    ctr: number;
  };
  previousTotals: {
    spend: number;
    impressions: number;
    clicks: number;
    installs: number;
    cpi: number;
    ctr: number;
  };
  dateRange: { startDate: string; endDate: string };
  previousDateRange: { startDate: string; endDate: string };
}

export function useGoogleAdsHistory() {
  const [data, setData] = useState<GoogleAdsHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (startDate: string, endDate: string, campaignId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: invokeError } = await supabase.functions.invoke("google-ads-history", {
        body: { startDate, endDate, campaignId },
      });

      if (invokeError) throw new Error(invokeError.message);
      if (!responseData?.success) throw new Error(responseData?.error || "Failed to fetch history");

      setData(responseData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, isLoading, error, fetchHistory, clearData };
}
