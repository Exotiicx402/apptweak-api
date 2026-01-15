import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
}

interface CampaignMetric {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
}

interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
}

interface MetaHistoryData {
  daily: DailyMetric[];
  campaigns: CampaignMetric[];
  totals: Totals;
  previousTotals: Totals;
  dateRange: { startDate: string; endDate: string };
  previousDateRange: { startDate: string; endDate: string };
}

export function useMetaHistory() {
  const [data, setData] = useState<MetaHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (startDate: string, endDate: string, campaignId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: invokeError } = await supabase.functions.invoke("meta-history", {
        body: { startDate, endDate, campaignId },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (!responseData?.success) {
        throw new Error(responseData?.error || "Failed to fetch history");
      }

      setData(responseData.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return {
    data,
    isLoading,
    error,
    fetchHistory,
    clearData,
  };
}
