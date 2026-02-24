import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// Map job IDs to friendly names based on the command
function getJobName(command: string): string {
  if (command.includes("unity-to-bigquery")) {
    if (command.includes("CURRENT_DATE - INTERVAL")) {
      return "Unity (Yesterday)";
    }
    return "Unity (Today)";
  }
  if (command.includes("snapchat-to-bigquery")) return "Snapchat";
  if (command.includes("meta-to-bigquery")) return "Meta";
  if (command.includes("apptweak-rank-to-sheets")) return "AppTweak Rankings";
  if (command.includes("slack-daily-report")) return "Slack Daily Report";
  if (command.includes("slack-cumulative-report")) return "Slack Cumulative Report";
  return "Unknown";
}

function parseSchedule(schedule: string): string {
  if (schedule === "*/15 * * * *") return "Every 15 minutes";
  if (schedule === "0 * * * *") return "Every hour";
  if (schedule === "0 0 * * *") return "Daily at midnight";
  if (schedule === "*/5 * * * *") return "Every 5 minutes";
  if (schedule === "*/30 * * * *") return "Every 30 minutes";

  // Dynamic daily schedule: "M H * * *" -> convert UTC to EST
  const dailyMatch = schedule.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (dailyMatch) {
    const minuteUtc = parseInt(dailyMatch[1], 10);
    let hourUtc = parseInt(dailyMatch[2], 10);
    // Convert UTC to EST (UTC-5)
    let hourEst = hourUtc - 5;
    if (hourEst < 0) hourEst += 24;
    const period = hourEst >= 12 ? "PM" : "AM";
    const hour12 = hourEst === 0 ? 12 : hourEst > 12 ? hourEst - 12 : hourEst;
    const minuteStr = minuteUtc.toString().padStart(2, "0");
    return `Daily at ${hour12}:${minuteStr} ${period} EST`;
  }

  return schedule;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();

  try {
    if (req.method === "GET") {
      // List all cron jobs
      const { data, error } = await supabase.rpc("get_cron_jobs");
      
      if (error) {
        // Fallback: query directly
        const { data: jobs, error: queryError } = await supabase
          .from("cron.job")
          .select("jobid, schedule, command, active");
        
        if (queryError) {
          throw queryError;
        }
        
        const formattedJobs = (jobs || []).map((job: any) => ({
          id: job.jobid,
          name: getJobName(job.command),
          schedule: job.schedule,
          scheduleDisplay: parseSchedule(job.schedule),
          active: job.active,
        }));

        return new Response(JSON.stringify({ jobs: formattedJobs }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const formattedJobs = (data || []).map((job: any) => ({
        id: job.jobid,
        name: getJobName(job.command),
        schedule: job.schedule,
        scheduleDisplay: parseSchedule(job.schedule),
        active: job.active,
      }));

      return new Response(JSON.stringify({ jobs: formattedJobs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { action, jobId, schedule } = body;

      if (action === "toggle") {
        // Toggle job active status
        const { error } = await supabase.rpc("toggle_cron_job", { job_id: jobId });
        if (error) throw error;
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "update_schedule") {
        // Update job schedule
        const { error } = await supabase.rpc("update_cron_schedule", { 
          job_id: jobId, 
          new_schedule: schedule 
        });
        if (error) throw error;
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
