-- Create a function to update cron job schedule
CREATE OR REPLACE FUNCTION public.update_cron_schedule(p_jobid bigint, p_schedule text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cron.job
  SET schedule = p_schedule
  WHERE jobid = p_jobid;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cron job with id % not found', p_jobid;
  END IF;
END;
$$;