-- Create storage bucket for creative assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-assets', 'creative-assets', true);

-- RLS policy for public read access
CREATE POLICY "Public read access for creative assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'creative-assets');

-- Service role can insert/update
CREATE POLICY "Service role can upload creative assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'creative-assets');

CREATE POLICY "Service role can update creative assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'creative-assets');

-- Create creative_assets metadata table
CREATE TABLE public.creative_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_name TEXT NOT NULL,
  concept_id TEXT,
  unique_identifier TEXT,
  platform TEXT NOT NULL,
  platform_creative_id TEXT,
  asset_type TEXT,
  thumbnail_url TEXT,
  original_url TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, platform_creative_id)
);

-- Enable RLS on creative_assets
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;

-- Allow public read access to creative_assets
CREATE POLICY "Allow public read access to creative_assets"
ON public.creative_assets FOR SELECT
USING (true);

-- Allow service role to insert/update (edge functions)
CREATE POLICY "Allow service insert to creative_assets"
ON public.creative_assets FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow service update to creative_assets"
ON public.creative_assets FOR UPDATE
USING (true);

-- Index for fast lookups by creative name
CREATE INDEX idx_creative_assets_name ON public.creative_assets(creative_name);
CREATE INDEX idx_creative_assets_concept ON public.creative_assets(concept_id);
CREATE INDEX idx_creative_assets_unique ON public.creative_assets(unique_identifier);