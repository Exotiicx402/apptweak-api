import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DiagnosticResult {
  swipe_up_attribution_window: string;
  view_attribution_window: string;
  action_report_time: string;
  total_installs: number;
  ios_installs: number;
  android_installs: number;
  error?: string;
}

export interface DiagnosticsResponse {
  success: boolean;
  diagnostics: boolean;
  date: string;
  results: DiagnosticResult[];
  durationMs: number;
  error?: string;
}

export function useSnapchatDiagnostics() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async (date: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('snapchat-preview', {
        body: { date, diagnostics: true },
      });

      if (fnError) {
        throw fnError;
      }

      if (!data.success) {
        throw new Error(data.error || 'Diagnostics failed');
      }

      setResult(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run diagnostics';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const clearDiagnostics = () => {
    setResult(null);
    setError(null);
  };

  return {
    isLoading,
    result,
    error,
    runDiagnostics,
    clearDiagnostics,
  };
}
