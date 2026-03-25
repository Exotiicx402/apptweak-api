import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HdMediaState {
  hdUrl: string | null;
  mediaType: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Layer 3: Lazy HD media fetch hook.
 * Calls fetch-creative-media edge function on demand (e.g., when user opens a detail dialog).
 */
export function useFetchHdMedia() {
  const [state, setState] = useState<HdMediaState>({
    hdUrl: null,
    mediaType: null,
    loading: false,
    error: null,
  });

  const fetchHdMedia = useCallback(async (params: {
    mediaType: "image" | "video";
    imageHash?: string;
    videoId?: string;
    adId?: string;
  }) => {
    setState({ hdUrl: null, mediaType: null, loading: true, error: null });

    try {
      const { data, error } = await supabase.functions.invoke("fetch-creative-media", {
        body: params,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to fetch HD media");

      setState({
        hdUrl: data.data.hdUrl,
        mediaType: data.data.mediaType,
        loading: false,
        error: null,
      });

      return data.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ hdUrl: null, mediaType: null, loading: false, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ hdUrl: null, mediaType: null, loading: false, error: null });
  }, []);

  return { ...state, fetchHdMedia, reset };
}
