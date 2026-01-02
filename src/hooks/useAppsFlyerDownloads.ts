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

export const useAppsFlyerDownloads = (days: number = 7) => {
  return useQuery({
    queryKey: ["appsflyer-downloads", days],
    queryFn: async (): Promise<DownloadDataPoint[]> => {
      const endDate = format(new Date(), "yyyy-MM-dd");
      const startDate = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

      console.log(`Fetching AppsFlyer downloads from ${startDate} to ${endDate}`);

      const { data, error } = await supabase.functions.invoke<AppsFlyerResponse>("appsflyer-ssot", {
        body: { startDate, endDate },
      });

      if (error) {
        console.error("AppsFlyer function error:", error);
        throw new Error(error.message);
      }

      if (data?.error) {
        console.error("AppsFlyer API error:", data.error);
        throw new Error(data.error);
      }

      console.log("AppsFlyer downloads data:", data?.downloads);
      return data?.downloads || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
};