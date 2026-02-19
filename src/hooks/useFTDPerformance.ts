import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FTDDailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ftd_count: number;
  cost_per_ftd: number;
  cpm: number;
  cpc: number;
  ctr: number;
}

export interface FTDAdsetRow {
  adset_id: string;
  adset_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ftd_count: number;
  cost_per_ftd: number;
  ctr: number;
}

export interface FTDAdRow {
  ad_id: string;
  ad_name: string;
  adset_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ftd_count: number;
  cost_per_ftd: number;
  ctr: number;
}

export interface FTDTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ftd_count: number;
  cost_per_ftd: number;
  cpm: number;
  cpc: number;
  ctr: number;
}

export interface FTDData {
  totals: FTDTotals;
  daily: FTDDailyRow[];
  adsets: FTDAdsetRow[];
  ads: FTDAdRow[];
}

const emptyTotals: FTDTotals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  ftd_count: 0,
  cost_per_ftd: 0,
  cpm: 0,
  cpc: 0,
  ctr: 0,
};

export function useFTDPerformance() {
  const [data, setData] = useState<FTDData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function fetchData(startDate: string, endDate: string) {
    setIsLoading(true);
    setError(null);

    try {
      const { data: rows, error: dbError } = await supabase
        .from("ftd_performance")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (dbError) throw dbError;

      const allRows = rows || [];

      // Daily aggregation
      const dailyMap = new Map<string, FTDDailyRow>();
      allRows.forEach((r) => {
        const d = r.date as string;
        if (!dailyMap.has(d)) {
          dailyMap.set(d, {
            date: d,
            spend: 0,
            impressions: 0,
            clicks: 0,
            ftd_count: 0,
            cost_per_ftd: 0,
            cpm: 0,
            cpc: 0,
            ctr: 0,
          });
        }
        const day = dailyMap.get(d)!;
        day.spend += Number(r.spend) || 0;
        day.impressions += Number(r.impressions) || 0;
        day.clicks += Number(r.clicks) || 0;
        day.ftd_count += Number(r.ftd_count) || 0;
      });

      // Compute derived daily metrics
      const daily = Array.from(dailyMap.values()).map((d) => ({
        ...d,
        cost_per_ftd: d.ftd_count > 0 ? d.spend / d.ftd_count : 0,
        cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
        cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      }));

      // Ad set aggregation
      const adsetMap = new Map<string, FTDAdsetRow>();
      allRows.forEach((r) => {
        const key = r.adset_id || r.adset_name || "unknown";
        if (!adsetMap.has(key)) {
          adsetMap.set(key, {
            adset_id: r.adset_id || "",
            adset_name: r.adset_name || "Unknown Ad Set",
            spend: 0,
            impressions: 0,
            clicks: 0,
            ftd_count: 0,
            cost_per_ftd: 0,
            ctr: 0,
          });
        }
        const as = adsetMap.get(key)!;
        as.spend += Number(r.spend) || 0;
        as.impressions += Number(r.impressions) || 0;
        as.clicks += Number(r.clicks) || 0;
        as.ftd_count += Number(r.ftd_count) || 0;
      });

      const adsets = Array.from(adsetMap.values())
        .map((as) => ({
          ...as,
          cost_per_ftd: as.ftd_count > 0 ? as.spend / as.ftd_count : 0,
          ctr: as.impressions > 0 ? (as.clicks / as.impressions) * 100 : 0,
        }))
        .sort((a, b) => b.spend - a.spend);

      // Ad-level aggregation
      const adMap = new Map<string, FTDAdRow>();
      allRows.forEach((r) => {
        const key = r.ad_id || r.ad_name || "unknown";
        if (!adMap.has(key)) {
          adMap.set(key, {
            ad_id: r.ad_id || "",
            ad_name: r.ad_name || "Unknown Ad",
            adset_name: r.adset_name || "",
            spend: 0,
            impressions: 0,
            clicks: 0,
            ftd_count: 0,
            cost_per_ftd: 0,
            ctr: 0,
          });
        }
        const ad = adMap.get(key)!;
        ad.spend += Number(r.spend) || 0;
        ad.impressions += Number(r.impressions) || 0;
        ad.clicks += Number(r.clicks) || 0;
        ad.ftd_count += Number(r.ftd_count) || 0;
      });

      const ads = Array.from(adMap.values())
        .map((ad) => ({
          ...ad,
          cost_per_ftd: ad.ftd_count > 0 ? ad.spend / ad.ftd_count : 0,
          ctr: ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0,
        }))
        .sort((a, b) => b.spend - a.spend);

      // Totals
      const totals: FTDTotals = allRows.reduce(
        (acc, r) => ({
          spend: acc.spend + (Number(r.spend) || 0),
          impressions: acc.impressions + (Number(r.impressions) || 0),
          clicks: acc.clicks + (Number(r.clicks) || 0),
          ftd_count: acc.ftd_count + (Number(r.ftd_count) || 0),
          cost_per_ftd: 0,
          cpm: 0,
          cpc: 0,
          ctr: 0,
        }),
        { ...emptyTotals }
      );

      totals.cost_per_ftd = totals.ftd_count > 0 ? totals.spend / totals.ftd_count : 0;
      totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
      totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
      totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

      setData({ totals, daily, adsets, ads });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch FTD data");
    } finally {
      setIsLoading(false);
    }
  }

  async function syncFromMeta(startDate: string, endDate: string) {
    setIsSyncing(true);
    setSyncResult(null);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/ftd-meta-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ startDate, endDate }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sync failed");

      setSyncResult(
        `Synced ${result.rowsUpserted} rows. Action types found: ${result.actionTypesFound?.join(", ") || "none"}`
      );

      // Refresh data after sync
      await fetchData(startDate, endDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  return { data, isLoading, isSyncing, error, syncResult, fetchData, syncFromMeta };
}
