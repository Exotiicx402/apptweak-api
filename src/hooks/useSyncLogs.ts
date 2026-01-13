import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SyncLog {
  id: string;
  source: 'unity' | 'snapchat' | 'meta';
  sync_date: string;
  status: 'success' | 'error';
  rows_affected: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export function useSyncLogs(source?: 'unity' | 'snapchat' | 'meta', limit = 20) {
  return useQuery({
    queryKey: ['sync-logs', source, limit],
    queryFn: async () => {
      let query = supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (source) {
        query = query.eq('source', source);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SyncLog[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
