
-- Create FTD performance table for the HOURS | PROSPECTING | INTERNATIONAL | TIER ONE | WEB | FTD campaign
CREATE TABLE public.ftd_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  spend numeric(12, 4) DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  ftd_count integer DEFAULT 0,
  cost_per_ftd numeric(12, 4) DEFAULT 0,
  cpm numeric(12, 4) DEFAULT 0,
  cpc numeric(12, 4) DEFAULT 0,
  ctr numeric(12, 6) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  synced_at timestamp with time zone DEFAULT now()
);

-- Index for fast date range queries
CREATE INDEX idx_ftd_performance_date ON public.ftd_performance (date);
CREATE INDEX idx_ftd_performance_ad_id ON public.ftd_performance (ad_id);
CREATE INDEX idx_ftd_performance_date_ad ON public.ftd_performance (date, ad_id);

-- Unique constraint: one row per (date, ad_id) to allow upserts
CREATE UNIQUE INDEX idx_ftd_performance_unique_row ON public.ftd_performance (date, ad_id) WHERE ad_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.ftd_performance ENABLE ROW LEVEL SECURITY;

-- Allow public read access (internal dashboard, no auth)
CREATE POLICY "Allow public read access to ftd_performance"
ON public.ftd_performance
FOR SELECT
USING (true);

-- Allow service inserts/updates (from edge functions)
CREATE POLICY "Allow service insert to ftd_performance"
ON public.ftd_performance
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow service update to ftd_performance"
ON public.ftd_performance
FOR UPDATE
USING (true);
