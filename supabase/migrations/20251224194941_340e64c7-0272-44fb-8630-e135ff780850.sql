-- Drop the existing function and recreate with proper cron.alter_job usage
DROP FUNCTION IF EXISTS public.update_cron_schedule(bigint, text);

CREATE OR REPLACE FUNCTION public.update_cron_schedule(p_jobid bigint, p_schedule text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
BEGIN
  PERFORM cron.alter_job(
    job_id := p_jobid,
    schedule := p_schedule
  );
END;
$$;