import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FacebookPageResult {
  id: string;
  name: string;
  category: string | null;
  fanCount: number;
  verified: boolean;
  pictureUrl: string | null;
}

export function useFacebookPageSearch(query: string) {
  const [results, setResults] = useState<FacebookPageResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.trim().length < 2) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('facebook-page-search', {
          body: { query: query.trim() },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        setResults(data?.results || []);
      } catch (err) {
        setError(String(err));
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return { results, isSearching, error };
}
