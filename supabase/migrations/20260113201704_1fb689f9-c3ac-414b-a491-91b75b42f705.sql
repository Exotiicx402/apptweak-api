-- Function to get all cron jobs
CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  schedule text,
  command text,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jobid, schedule, command, active FROM cron.job ORDER BY jobid;
$$;

-- Function to toggle a cron job's active status
CREATE OR REPLACE FUNCTION public.toggle_cron_job(job_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  current_status boolean;
BEGIN
  SELECT active INTO current_status FROM cron.job WHERE jobid = job_id;
  
  IF current_status THEN
    PERFORM cron.alter_job(job_id, active := false);
  ELSE
    PERFORM cron.alter_job(job_id, active := true);
  END IF;
END;
$$;

-- Function to update a cron job's schedule
CREATE OR REPLACE FUNCTION public.update_cron_schedule(job_id bigint, new_schedule text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  PERFORM cron.alter_job(job_id, schedule := new_schedule);
END;
$$;