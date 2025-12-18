import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export const useAppTweakMetricsHistory = (appId: string, days: number = 7) => {
  return useQuery({
    queryKey: ["apptweak-metrics-history", appId, days],
    queryFn: async (): Promise<DownloadsHistoryPoint[]> => {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      
      return downloads
        .filter(d => d.value !== null)
        .map(d => ({
          date: d.date,
          downloads: d.value,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
};
