import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const APP_ID = "6648798962";

interface RankingValue {
  rank: number;
  fetch_date: string;
  category: string;
  category_name: string;
  chart_type: string;
  fetch_depth: number;
}

interface RankingHistory {
  value: RankingValue[];
}

interface AppTweakHistoryResponse {
  result: {
    [appId: string]: {
      rankings: RankingHistory[];
    };
  };
}

export interface ChartDataPoint {
  date: string;
  rank: number;
  category: string;
  categoryName: string;
}

export const useAppTweakRankingHistory = () => {
  return useQuery({
    queryKey: ["apptweak-ranking-history", APP_ID],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      const { data, error } = await supabase.functions.invoke('apptweak-ranking-history', {
        body: { appId: APP_ID, country: 'us', device: 'iphone' }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to fetch ranking history');
      }

      const response = data as AppTweakHistoryResponse;
      const rankings = response?.result?.[APP_ID]?.rankings || [];
      
      // Flatten and transform the data for the chart
      const chartData: ChartDataPoint[] = [];
      
      for (const ranking of rankings) {
        for (const value of ranking.value) {
          // Only include "All" category and "free" chart type for simplicity
          if (value.category === "6004" && value.chart_type === "free") {
            chartData.push({
              date: value.fetch_date,
              rank: value.rank,
              category: value.category,
              categoryName: value.category_name,
            });
          }
        }
      }
      
      // Sort by date
      chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return chartData;
    },
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
};
