import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getRollingRange } from "@/lib/rollingDateRange";

interface DownloadDataPoint {
  value: number;
  date: string;
  precision: number;
}

interface AppTweakMetricsHistoryResponse {
  result: {
    [appId: string]: {
      downloads?: DownloadDataPoint[];
    };
  };
}

export interface DownloadsHistoryPoint {
  date: string;
  downloads: number;
}

export const useAppTweakMetricsHistory = (appId: string, points: number = 8) => {
  const { startDate, endDate, dates } = getRollingRange({ points, endOffsetDays: 1 });

  return useQuery({
    queryKey: ["apptweak-metrics-history", appId, points, endDate],
    queryFn: async (): Promise<DownloadsHistoryPoint[]> => {
      const { data, error } = await supabase.functions.invoke('apptweak-metrics-history', {
        body: { 
          appId, 
          country: 'us', 
          device: 'iphone', 
          metrics: 'downloads',
          startDate,
          endDate
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to fetch metrics history');
      }

      const response = data as AppTweakMetricsHistoryResponse;
      const downloads = response?.result?.[appId]?.downloads || [];
      
      // Build a map from API results
      const dataMap = new Map(
        downloads
          .filter(d => d.value !== null)
          .map(d => [d.date, d.value])
      );

      // Normalize to exactly `points` data points
      return dates.map(date => ({
        date,
        downloads: dataMap.get(date) ?? 0,
      }));
    },
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
};
