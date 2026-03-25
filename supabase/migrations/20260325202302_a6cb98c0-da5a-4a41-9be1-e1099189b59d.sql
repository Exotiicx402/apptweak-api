
-- Table 1: Cache synced ad data + insights per day
CREATE TABLE public.ad_creatives_daily_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  date date NOT NULL,
  ad_id text NOT NULL,
  adset_id text,
  ad_data jsonb DEFAULT '{}'::jsonb,
  insights_data jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(account_id, date, ad_id)
);

ALTER TABLE public.ad_creatives_daily_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read ad_creatives_daily_cache" ON public.ad_creatives_daily_cache FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert ad_creatives_daily_cache" ON public.ad_creatives_daily_cache FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update ad_creatives_daily_cache" ON public.ad_creatives_daily_cache FOR UPDATE TO public USING (true);

-- Table 2: Cache resolved HD URLs
CREATE TABLE public.creative_media_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  media_id text NOT NULL,
  media_type text DEFAULT 'image',
  hd_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_id, media_id)
);

ALTER TABLE public.creative_media_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read creative_media_cache" ON public.creative_media_cache FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert creative_media_cache" ON public.creative_media_cache FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update creative_media_cache" ON public.creative_media_cache FOR UPDATE TO public USING (true);

-- Table 3: Permanently stored images in Supabase Storage
CREATE TABLE public.processed_creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  creative_id text NOT NULL,
  media_type text DEFAULT 'image',
  original_url text,
  stored_url text,
  width integer,
  height integer,
  file_size integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_id, creative_id, media_type)
);

ALTER TABLE public.processed_creative_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read processed_creative_assets" ON public.processed_creative_assets FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert processed_creative_assets" ON public.processed_creative_assets FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update processed_creative_assets" ON public.processed_creative_assets FOR UPDATE TO public USING (true);
