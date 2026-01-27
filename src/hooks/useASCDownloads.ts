import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getRollingRange } from "@/lib/rollingDateRange";

interface DownloadDataPoint {
  date: string;
  downloads: number;
}

interface ASCResponse {
  downloads: DownloadDataPoint[];
  error?: string;
  dataDelayed?: boolean;
  message?: string;
}

const APP_ID = "6648798962";

export const useASCDownloads = (points: number = 7) => {
  // ASC data lags 1-2 days, so offset end by 2 days
  const { startDate, endDate, dates } = getRollingRange({ points, endOffsetDays: 2 });

  return useQuery({
    queryKey: ["asc-downloads", points, endDate],
    queryFn: async (): Promise<{ data: DownloadDataPoint[]; dataDelayed?: boolean; message?: string }> => {
      console.log(`Fetching ASC downloads from ${startDate} to ${endDate}`);

      try {
        const { data, error } = await supabase.functions.invoke<ASCResponse>("asc-downloads", {
          body: { appId: APP_ID, startDate, endDate },
        });

        if (error) {
          console.error("ASC function error:", error);
          return { data: [], dataDelayed: true, message: error.message };
        }

        if (data?.error) {
          console.error("ASC API error:", data.error);
          return { data: [], dataDelayed: data.dataDelayed, message: data.message || data.error };
        }

        const rawData = data?.downloads || [];
        
        // Normalize to exactly `points` data points
        const dataMap = new Map(rawData.map(d => [d.date, d.downloads]));
        const normalizedData = dates.map(date => ({
          date,
          downloads: dataMap.get(date) ?? 0,
        }));

        return { 
          data: normalizedData, 
          dataDelayed: data?.dataDelayed,
          message: data?.message
        };
      } catch (err) {
        console.error("ASC request failed:", err);
        return { data: [], dataDelayed: true, message: "Failed to fetch App Store Connect data" };
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
};
