ALTER TABLE public.ftd_performance
  ADD COLUMN IF NOT EXISTS results_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roas numeric DEFAULT 0;