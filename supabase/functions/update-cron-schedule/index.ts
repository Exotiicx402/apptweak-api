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

    const { jobid, schedule } = await req.json();
    
    if (!jobid || !schedule) {
      return new Response(
        JSON.stringify({ error: 'Missing jobid or schedule' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updating cron job ${jobid} schedule to: ${schedule}`);

    // Call the database function to update the schedule
    const { data, error } = await supabase.rpc('update_cron_schedule', {
      p_jobid: jobid,
      p_schedule: schedule,
    });

    if (error) {
      console.error('RPC error:', error);
      throw new Error(`Failed to update schedule: ${error.message}`);
    }

    console.log('Schedule updated successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Schedule updated' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error updating schedule:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
