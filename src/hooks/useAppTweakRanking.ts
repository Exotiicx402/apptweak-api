import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const APP_ID = "6648798962";

interface RankingData {
  value: number;
  date: string;
  category: string;
  category_name: string;
  chart_type: string;
  fetch_depth: number;
}

interface AppTweakResponse {
  result: {
    [appId: string]: {
      ranking: RankingData[];
    };
  };
}

export const getCurlCommand = () => {
  return `curl --request GET \\
  --url 'https://public-api.apptweak.com/api/public/store/apps/category-rankings/current.json?apps=${APP_ID}&country=us&device=iphone' \\
  --header 'accept: application/json' \\
  --header 'x-apptweak-key: YOUR_API_KEY'`;
};

export const useAppTweakRanking = () => {
  return useQuery({
    queryKey: ["apptweak-ranking", APP_ID],
    queryFn: async (): Promise<RankingData[] | null> => {
      const { data, error } = await supabase.functions.invoke('apptweak-ranking', {
        body: { appId: APP_ID, country: 'us', device: 'iphone' }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to fetch rankings');
      }

      const response = data as AppTweakResponse;
      return response?.result?.[APP_ID]?.ranking || null;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: 2,
  });
};
