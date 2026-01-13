import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MetaCampaignData {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  cpm: string;
  cpc: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface MetaPreviewResult {
  success: boolean;
  date: string;
  count: number;
  data: MetaCampaignData[];
  durationMs?: number;
  error?: string;
}

export function useMetaPreview() {
  const [data, setData] = useState<MetaCampaignData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const fetchPreview = async (date?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke<MetaPreviewResult>(
        "meta-preview",
        {
          body: date ? { date } : {},
        }
      );

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!result?.success) {
        throw new Error(result?.error || "Failed to fetch preview");
      }

      setData(result.data);
      setPreviewDate(result.date);
      setDurationMs(result.durationMs || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setData(null);
      setDurationMs(null);
    } finally {
      setIsLoading(false);
    }
  };

  const clearPreview = () => {
    setData(null);
    setError(null);
    setPreviewDate(null);
    setDurationMs(null);
  };

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
