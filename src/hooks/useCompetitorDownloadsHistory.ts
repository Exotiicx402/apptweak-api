import { useQueries } from "@tanstack/react-query";
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

export interface CompetitorApp {
  id: string;
  name: string;
  color: string;
}

export const COMPETITOR_APPS: CompetitorApp[] = [
  { id: "1514665962", name: "Underdog", color: "hsl(38, 92%, 50%)" }, // Orange
  { id: "1375031369", name: "DraftKings", color: "hsl(142, 71%, 45%)" }, // Green
  { id: "1413721906", name: "FanDuel", color: "hsl(224, 100%, 59%)" }, // Blue
  { id: "1437843273", name: "PrizePicks", color: "hsl(262, 83%, 58%)" }, // Purple
  { id: "294056623", name: "Fox Sports", color: "hsl(0, 84%, 60%)" }, // Red
];

export interface CompetitorDownloadsPoint {
  date: string;
  displayDate: string;
  [key: string]: number | string; // Dynamic keys for each competitor
}

const fetchAppDownloadsHistory = async (appId: string, days: number) => {
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
    console.error(`Edge function error for ${appId}:`, error);
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
};

export const useCompetitorDownloadsHistory = (days: number = 7) => {
  const queries = useQueries({
    queries: COMPETITOR_APPS.map(app => ({
      queryKey: ["competitor-downloads-history", app.id, days],
      queryFn: () => fetchAppDownloadsHistory(app.id, days),
      refetchInterval: 5 * 60 * 1000,
      retry: 2,
    })),
  });

  const isLoading = queries.some(q => q.isLoading);
  const isError = queries.every(q => q.isError);
  const errors = queries.filter(q => q.error).map(q => q.error);

  // Merge all data by date
  const mergedData: CompetitorDownloadsPoint[] = [];
  
  if (!isLoading && queries.some(q => q.data)) {
    // Get all unique dates
    const allDates = new Set<string>();
    queries.forEach((q, idx) => {
      if (q.data) {
        q.data.forEach(d => allDates.add(d.date));
      }
    });

    // Sort dates
    const sortedDates = Array.from(allDates).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    // Build merged data
    sortedDates.forEach(date => {
      const point: CompetitorDownloadsPoint = {
        date,
        displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };

      queries.forEach((q, idx) => {
        const app = COMPETITOR_APPS[idx];
        const dayData = q.data?.find(d => d.date === date);
        point[app.name] = dayData?.downloads || 0;
      });

      mergedData.push(point);
    });
  }

  return {
    data: mergedData,
    isLoading,
    isError,
    errors,
    queries,
  };
};
