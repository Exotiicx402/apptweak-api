import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

interface DownloadDataPoint {
  date: string;
  downloads: number;
}

interface AppsFlyerResponse {
  downloads: DownloadDataPoint[];
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

export const useAppsFlyerDownloads = (days: number = 8) => {
  return useQuery({
    queryKey: ["appsflyer-downloads", days],
    queryFn: async (): Promise<DownloadDataPoint[]> => {
      // Use yesterday as end date since today's data may not be complete
      const endDate = format(subDays(new Date(), 1), "yyyy-MM-dd");
      const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

      console.log(`Fetching AppsFlyer downloads from ${startDate} to ${endDate}`);

      try {
        const { data, error } = await supabase.functions.invoke<AppsFlyerResponse>("appsflyer-ssot", {
          body: { startDate, endDate },
        });

        if (error) {
          console.error("AppsFlyer function error:", error);
          // Fallback to cached data
          console.log("Falling back to cached database data...");
          return await fetchCachedDownloads(startDate, endDate);
        }

        if (data?.error) {
          console.error("AppsFlyer API error:", data.error);
          // Fallback to cached data
          console.log("Falling back to cached database data...");
          return await fetchCachedDownloads(startDate, endDate);
        }

        console.log("AppsFlyer downloads data:", data?.downloads);
        return data?.downloads || [];
      } catch (err) {
        console.error("AppsFlyer request failed:", err);
        // Fallback to cached data
        console.log("Falling back to cached database data...");
        return await fetchCachedDownloads(startDate, endDate);
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
};
