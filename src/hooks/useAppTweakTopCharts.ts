import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopChartApp {
  id: string;
  rank: number;
}

export interface TopChartsResponse {
  apps: TopChartApp[];
  category: string;
  categoryName: string;
  date: string;
}

export const useAppTweakTopCharts = (
  country: string = 'us',
  device: string = 'iphone',
  category: string = '6004'
) => {
  return useQuery({
    queryKey: ['apptweak-top-charts', country, device, category],
    queryFn: async (): Promise<TopChartsResponse> => {
      const { data, error } = await supabase.functions.invoke('apptweak-top-charts', {
        body: null,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Parse the response - the API returns app IDs in the result
      const result = data?.result;
      if (!result) {
        return { apps: [], category, categoryName: 'Sports', date: new Date().toISOString() };
      }

      // The API returns results keyed by category
      const categoryData = result[category];
      const freeData = categoryData?.free;
      if (!freeData?.value) {
        return { apps: [], category, categoryName: 'Sports', date: new Date().toISOString() };
      }

      const apps: TopChartApp[] = freeData.value.map((appId: number, index: number) => ({
        id: String(appId),
        rank: index + 1,
      }));

      return {
        apps,
        category,
        categoryName: 'Sports',
        date: freeData.date || new Date().toISOString(),
      };
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });
};
