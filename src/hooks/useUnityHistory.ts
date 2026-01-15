import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UnityHistoryData {
  daily: any[];
  campaigns: any[];
  countries: any[];
  totals: any;
  previousTotals: any;
  dateRange: { startDate: string; endDate: string };
  previousDateRange: { startDate: string; endDate: string };
}

export function useUnityHistory() {
  const [data, setData] = useState<UnityHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (startDate: string, endDate: string, campaignId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: invokeError } = await supabase.functions.invoke("unity-history", {
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

  return { data, isLoading, error, fetchHistory };
}
