import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the database function to get cron job status
    const { data: jobs, error } = await supabase.rpc('get_cron_job_status');
    
    if (error) {
      console.error('Error fetching cron status:', error);
      throw error;
    }

    // Transform to expected format
    const formattedJobs = (jobs || []).map((job: any) => ({
      jobid: job.jobid,
      jobname: job.jobname,
      schedule: job.schedule,
      active: job.active,
      nodename: job.nodename,
      last_run: job.last_run_start ? {
        status: job.last_run_status,
        start_time: job.last_run_start,
        end_time: job.last_run_end,
        return_message: job.last_run_message,
      } : null,
    }));

    return new Response(
      JSON.stringify({ jobs: formattedJobs }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching cron status:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        jobs: [] 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
