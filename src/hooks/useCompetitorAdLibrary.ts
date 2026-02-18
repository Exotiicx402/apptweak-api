import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CompetitorWatchlistEntry } from "./useCompetitorWatchlist";

export interface CompetitorAd {
  id: string;
  pageId: string;
  pageName: string;
  body: string;
  snapshotUrl: string;
  platforms: string[];
  startDate: string | null;
  stopDate: string | null;
  daysRunning: number | null;
  impressionsRange: string | null;
}

export interface CompetitorAdGroup {
  competitor: CompetitorWatchlistEntry;
  ads: CompetitorAd[];
}

export function useCompetitorAdLibrary(
  competitors: CompetitorWatchlistEntry[],
  enabled = true
) {
  const activeCompetitors = competitors.filter((c) => c.active && c.facebook_page_id);
  const pageIds = activeCompetitors.map((c) => c.facebook_page_id);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["competitor-ad-library", pageIds.join(",")],
    queryFn: async () => {
      if (pageIds.length === 0) return { ads: [] as CompetitorAd[], total: 0 };

      const { data, error } = await supabase.functions.invoke("competitor-ad-library", {
        body: { pageIds, adActiveStatus: "ACTIVE", limit: 30 },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Unknown error");
      return data as { ads: CompetitorAd[]; total: number };
    },
    enabled: enabled && pageIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const adsByPageId = new Map<string, CompetitorAd[]>();
  (data?.ads || []).forEach((ad) => {
    if (!adsByPageId.has(ad.pageId)) adsByPageId.set(ad.pageId, []);
    adsByPageId.get(ad.pageId)!.push(ad);
  });

  const grouped: CompetitorAdGroup[] = activeCompetitors.map((competitor) => ({
    competitor,
    ads: adsByPageId.get(competitor.facebook_page_id) || [],
  }));

  return {
    grouped,
    totalAds: data?.total || 0,
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
