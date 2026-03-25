import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DailyRow {
  date: string;
  spend: number;
  installs: number;
  impressions: number;
  clicks: number;
  registrations: number;
  ftds: number;
  ftdValue: number;
  trades: number;
  tradeValue: number;
}

export interface PlatformMetrics {
  spend: number;
  installs: number;
  cpi: number;
  registrations: number;
  ftds: number;
  clicks: number;
  impressions: number;
  previousSpend: number;
  previousInstalls: number;
  previousCpi: number;
  previousRegistrations: number;
  previousFtds: number;
  previousClicks: number;
  previousImpressions: number;
  daily: DailyRow[];
  isLoading: boolean;
  error: string | null;
  dataUnavailable?: boolean;
  unavailableReason?: string;
}

export interface GrandTotals {
  spend: number;
  installs: number;
  cpi: number;
  registrations: number;
  cps: number;
  ftds: number;
  cftd: number;
  previousSpend: number;
  previousInstalls: number;
  previousCpi: number;
  previousRegistrations: number;
  previousCps: number;
  previousFtds: number;
  previousCftd: number;
}

interface ReportingData {
  meta: PlatformMetrics;
  moloco: PlatformMetrics;
  totals: GrandTotals;
}

const emptyMetrics: PlatformMetrics = {
  spend: 0, installs: 0, cpi: 0, registrations: 0, ftds: 0, clicks: 0, impressions: 0,
  previousSpend: 0, previousInstalls: 0, previousCpi: 0, previousRegistrations: 0,
  previousFtds: 0, previousClicks: 0, previousImpressions: 0,
  daily: [], isLoading: false, error: null,
};

const emptyTotals: GrandTotals = {
  spend: 0, installs: 0, cpi: 0, registrations: 0, cps: 0, ftds: 0, cftd: 0,
  previousSpend: 0, previousInstalls: 0, previousCpi: 0, previousRegistrations: 0,
  previousCps: 0, previousFtds: 0, previousCftd: 0,
};

export function useReportingData() {
  const [data, setData] = useState<ReportingData>({
    meta: { ...emptyMetrics },
    moloco: { ...emptyMetrics },
    totals: { ...emptyTotals },
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchAllPlatforms = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true);
    setData(prev => ({
      ...prev,
      meta: { ...emptyMetrics, isLoading: true },
      moloco: { ...emptyMetrics, isLoading: true },
    }));

    const [metaResult, molocoResult] = await Promise.allSettled([
      supabase.functions.invoke("meta-history", { body: { startDate, endDate } }),
      supabase.functions.invoke("moloco-history", { body: { startDate, endDate } }),
    ]);

    const extractMetrics = (result: PromiseSettledResult<any>, hasFunnel = false): PlatformMetrics => {
      if (result.status === "rejected") {
        return { ...emptyMetrics, error: result.reason?.message || "Failed to fetch" };
      }
      const { data: responseData, error } = result.value;
      if (error) return { ...emptyMetrics, error: error.message };
      if (!responseData?.success) return { ...emptyMetrics, error: responseData?.error || "Failed to fetch" };

      const totals = responseData.data?.totals || {};
      const previousTotals = responseData.data?.previousTotals || {};
      const rawDaily = responseData.data?.daily || [];

      const daily: DailyRow[] = rawDaily.map((d: any) => ({
        date: d.date,
        spend: parseFloat(d.spend) || 0,
        installs: parseInt(d.installs) || 0,
        impressions: parseInt(d.impressions) || 0,
        clicks: parseInt(d.clicks) || 0,
        registrations: parseInt(d.registrations) || 0,
        ftds: parseInt(d.ftds) || 0,
        trades: parseInt(d.trades) || 0,
        ftdValue: 0,
        tradeValue: 0,
      }));

      return {
        spend: totals.spend || 0,
        installs: totals.installs || 0,
        cpi: totals.cpi || (totals.spend && totals.installs ? totals.spend / totals.installs : 0),
        registrations: totals.registrations || 0,
        ftds: totals.ftds || 0,
        clicks: totals.clicks || 0,
        impressions: totals.impressions || 0,
        previousSpend: previousTotals.spend || 0,
        previousInstalls: previousTotals.installs || 0,
        previousCpi: previousTotals.cpi || (previousTotals.spend && previousTotals.installs ? previousTotals.spend / previousTotals.installs : 0),
        previousRegistrations: previousTotals.registrations || 0,
        previousFtds: previousTotals.ftds || 0,
        previousClicks: previousTotals.clicks || 0,
        previousImpressions: previousTotals.impressions || 0,
        daily,
        isLoading: false,
        error: null,
        dataUnavailable: responseData.data?.todayDataUnavailable || false,
        unavailableReason: responseData.data?.unavailableReason || "",
      };
    };

    const meta = extractMetrics(metaResult, true);
    const moloco = extractMetrics(molocoResult);

    // Calculate grand totals
    const platforms = [meta, moloco].filter(p => !p.error);
    const totalSpend = platforms.reduce((s, p) => s + p.spend, 0);
    const totalInstalls = platforms.reduce((s, p) => s + p.installs, 0);
    const totalRegistrations = platforms.reduce((s, p) => s + p.registrations, 0);
    const totalFtds = platforms.reduce((s, p) => s + p.ftds, 0);
    const prevTotalSpend = platforms.reduce((s, p) => s + p.previousSpend, 0);
    const prevTotalInstalls = platforms.reduce((s, p) => s + p.previousInstalls, 0);
    const prevTotalRegistrations = platforms.reduce((s, p) => s + p.previousRegistrations, 0);
    const prevTotalFtds = platforms.reduce((s, p) => s + p.previousFtds, 0);

    setData({
      meta,
      moloco,
      totals: {
        spend: totalSpend,
        installs: totalInstalls,
        cpi: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
        registrations: totalRegistrations,
        cps: totalRegistrations > 0 ? totalSpend / totalRegistrations : 0,
        ftds: totalFtds,
        cftd: totalFtds > 0 ? totalSpend / totalFtds : 0,
        previousSpend: prevTotalSpend,
        previousInstalls: prevTotalInstalls,
        previousCpi: prevTotalInstalls > 0 ? prevTotalSpend / prevTotalInstalls : 0,
        previousRegistrations: prevTotalRegistrations,
        previousCps: prevTotalRegistrations > 0 ? prevTotalSpend / prevTotalRegistrations : 0,
        previousFtds: prevTotalFtds,
        previousCftd: prevTotalFtds > 0 ? prevTotalSpend / prevTotalFtds : 0,
      },
    });

    setIsLoading(false);
  }, []);

  return { data, isLoading, fetchAllPlatforms };
}
