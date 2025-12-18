import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DownloadsMetric {
  value: number;
  date: string;
  precision: number;
}

interface RevenuesMetric {
  value: number;
  date: string;
  precision: number;
  currency: string;
}

interface AppPowerMetric {
  value: number;
  date: string;
}

interface AppMetrics {
  downloads?: DownloadsMetric;
  revenues?: RevenuesMetric;
  "app-power"?: AppPowerMetric;
}

interface AppTweakMetricsResponse {
  result: {
    [appId: string]: AppMetrics;
  };
}

export interface MetricsData {
  downloads: number | null;
  downloadsDate: string | null;
  revenues: number | null;
  revenuesCurrency: string | null;
  appPower: number | null;
}

export const useAppTweakMetrics = (appId: string) => {
  return useQuery({
    queryKey: ["apptweak-metrics", appId],
    queryFn: async (): Promise<MetricsData> => {
      const { data, error } = await supabase.functions.invoke('apptweak-metrics', {
        body: { appId, country: 'us', device: 'iphone', metrics: 'downloads,revenues,app-power' }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to fetch app metrics');
      }

      const response = data as AppTweakMetricsResponse;
      const appData = response?.result?.[appId];
      
      return {
        downloads: appData?.downloads?.value ?? null,
        downloadsDate: appData?.downloads?.date ?? null,
        revenues: appData?.revenues?.value ?? null,
        revenuesCurrency: appData?.revenues?.currency ?? null,
        appPower: appData?.["app-power"]?.value ?? null,
      };
    },
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
};
