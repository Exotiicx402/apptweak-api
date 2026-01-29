import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UnityRow {
  timestamp: string;
  campaign_id: string;
  campaign_name: string;
  country: string;
  platform: string;
  creative_pack_type: string;
  starts: number;
  views: number;
  clicks: number;
  installs: number;
  spend: number;
  cpi: number;
  ctr: number;
  cvr: number;
  ecpm: number;
  d0_ad_revenue: number;
  d0_total_roas: number;
  d0_retained: number;
  d0_retention_rate: number;
  d1_ad_revenue: number;
  d1_total_roas: number;
  d1_retained: number;
  d1_retention_rate: number;
  d3_ad_revenue: number;
  d3_total_roas: number;
  d3_retained: number;
  d3_retention_rate: number;
  d7_ad_revenue: number;
  d7_total_roas: number;
  d7_retained: number;
  d7_retention_rate: number;
  d14_ad_revenue: number;
  d14_total_roas: number;
  d14_retained: number;
  d14_retention_rate: number;
  fetched_at: string;
}

export interface UnitySummary {
  totalSpend: number;
  totalInstalls: number;
  totalClicks: number;
  avgCpi: number;
  rowCount: number;
  campaigns: { name: string; spend: number }[];
  countries: { name: string; installs: number }[];
  platforms: { name: string; spend: number }[];
}

export interface UnityPreviewResult {
  success: boolean;
  data: UnityRow[];
  summary: UnitySummary;
  startDate: string;
  endDate: string;
  durationMs: number;
  error?: string;
}

export function useUnityPreview() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<UnityPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = async (startDate?: string, endDate?: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Build request body based on parameters
      let body: Record<string, string> = {};
      if (startDate && endDate) {
        body = { startDate, endDate };
      } else if (startDate) {
        // Single date treated as range of 1 day
        body = { startDate, endDate: startDate };
      }
      // If no dates, the edge function defaults to yesterday

      const { data, error: fnError } = await supabase.functions.invoke('unity-preview', {
        body,
      });

      if (fnError) {
        throw fnError;
      }

      if (!data.success) {
        throw new Error(data.error || 'Preview failed');
      }

      setResult(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch preview';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const clearPreview = () => {
    setResult(null);
    setError(null);
  };

  return {
    isLoading,
    result,
    error,
    fetchPreview,
    clearPreview,
  };
}
