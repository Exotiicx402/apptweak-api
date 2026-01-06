import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SnapchatRow {
  timestamp: string;
  campaign_id: string;
  campaign_name: string;
  impressions: number;
  swipes: number;
  spend: number;
  video_views: number;
  screen_time_millis: number;
  quartile_1: number;
  quartile_2: number;
  quartile_3: number;
  view_completion: number;
  total_installs: number;
  conversion_purchases: number;
  conversion_purchases_value: number;
}

export interface SnapchatSummary {
  totalSpend: number;
  totalImpressions: number;
  totalSwipes: number;
  totalInstalls: number;
  avgCpi: number;
  rowCount: number;
  campaigns: { id: string; spend: number; installs: number; impressions: number }[];
}

export interface SnapchatPreviewResult {
  success: boolean;
  data: SnapchatRow[];
  summary: SnapchatSummary;
  date: string;
  durationMs: number;
  error?: string;
}

export function useSnapchatPreview() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SnapchatPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = async (date?: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('snapchat-preview', {
        body: date ? { date } : {},
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
