import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getRollingRange } from "@/lib/rollingDateRange";

interface DownloadDataPoint {
  date: string;
  downloads: number;
}

interface AppsFlyerResponse {
  downloads: DownloadDataPoint[];
  disabled?: boolean;
  error?: string;
}

const APP_ID = "6648798962";

// Fallback to cached data from the database
const fetchCachedDownloads = async (startDate: string, endDate: string): Promise<DownloadDataPoint[]> => {
  console.log(`Fetching cached AppsFlyer data from database for ${startDate} to ${endDate}`);
  
  const { data, error } = await supabase
    .from("app_downloads_history")
    .select("date, downloads")
    .eq("app_id", APP_ID)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching cached downloads:", error);
    return [];
  }

  return (data || []).map(row => ({
    date: row.date,
    downloads: row.downloads || 0,
  }));
};

export const useAppsFlyerDownloads = (points: number = 8) => {
  const { startDate, endDate, dates } = getRollingRange({ points, endOffsetDays: 1 });

  return useQuery({
    queryKey: ["appsflyer-downloads", points, endDate],
    queryFn: async (): Promise<DownloadDataPoint[]> => {
      console.log(`Fetching AppsFlyer downloads from ${startDate} to ${endDate}`);

      let rawData: DownloadDataPoint[] = [];

      const { data, error } = await supabase.functions.invoke<AppsFlyerResponse>("appsflyer-ssot", {
        body: { startDate, endDate },
      });

      // If disabled, just return empty data
      if (data?.disabled) {
        console.log('AppsFlyer API is disabled');
        rawData = [];
      } else if (error) {
        console.error("AppsFlyer function error:", error);
        rawData = await fetchCachedDownloads(startDate, endDate);
      } else if (data?.error) {
        console.error("AppsFlyer API error:", data.error);
        rawData = await fetchCachedDownloads(startDate, endDate);
      } else {
        rawData = data?.downloads || [];
      }

      // Normalize to exactly `points` data points
      const dataMap = new Map(rawData.map(d => [d.date, d.downloads]));
      return dates.map(date => ({
        date,
        downloads: dataMap.get(date) ?? 0,
      }));
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - reduce noise from quota limits
    refetchInterval: false, // Disable auto-refetch to prevent quota spam
    retry: 0, // Don't retry on failure (quota hit)
  });
};
