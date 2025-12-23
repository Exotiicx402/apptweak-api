import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CronJobRun {
  runid: number;
  job_pid: number;
  database: string;
  username: string;
  command: string;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
}

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  nodename: string;
  last_run: CronJobRun | null;
}

interface CronStatusResponse {
  jobs: CronJob[];
  error?: string;
}

export function useCronStatus() {
  return useQuery({
    queryKey: ['cron-status'],
    queryFn: async (): Promise<CronStatusResponse> => {
      const { data, error } = await supabase.functions.invoke('cron-status');
      
      if (error) {
        throw error;
      }
      
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}
