import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GoogleAdsCampaignData {
  campaign_id: string;
  campaign_name: string;
  impressions: number;
  clicks: number;
  cost_micros: number;
  spend: string;
  installs: number;
  cpi: string;
  ctr: string;
  date: string;
}

interface GoogleAdsPreviewResult {
  data: GoogleAdsCampaignData[] | null;
  isLoading: boolean;
  error: string | null;
  previewDate: string | null;
  durationMs: number | null;
  fetchPreview: (date?: string) => Promise<void>;
  clearPreview: () => void;
}

export function useGoogleAdsPreview(): GoogleAdsPreviewResult {
  const [data, setData] = useState<GoogleAdsCampaignData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const fetchPreview = useCallback(async (date?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: response, error: fnError } = await supabase.functions.invoke(
        "google-ads-preview",
        {
          body: date ? { date } : {},
        }
      );

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!response.success) {
        throw new Error(response.error || "Failed to fetch Google Ads data");
      }

      setData(response.data);
      setPreviewDate(response.date);
      setDurationMs(response.durationMs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearPreview = useCallback(() => {
    setData(null);
    setError(null);
    setPreviewDate(null);
    setDurationMs(null);
  }, []);

  return {
    data,
    isLoading,
    error,
    previewDate,
    durationMs,
    fetchPreview,
    clearPreview,
  };
}
