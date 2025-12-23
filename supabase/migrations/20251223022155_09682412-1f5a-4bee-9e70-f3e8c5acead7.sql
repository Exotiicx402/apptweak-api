-- Create a function to get cron job status (callable from edge functions)
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  nodename text,
  last_run_status text,
  last_run_start timestamptz,
  last_run_end timestamptz,
  last_run_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    j.nodename,
    d.status as last_run_status,
    d.start_time as last_run_start,
    d.end_time as last_run_end,
    d.return_message as last_run_message
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT rd.status, rd.start_time, rd.end_time, rd.return_message
    FROM cron.job_run_details rd
    WHERE rd.jobid = j.jobid
    ORDER BY rd.start_time DESC
    LIMIT 1
  ) d ON true
  WHERE j.jobname LIKE '%unity%'
  ORDER BY j.jobname;
END;
$$;