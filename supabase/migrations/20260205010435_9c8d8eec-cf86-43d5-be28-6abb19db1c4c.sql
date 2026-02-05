-- Add columns for full-resolution assets
ALTER TABLE public.creative_assets 
ADD COLUMN IF NOT EXISTS full_asset_url text,
ADD COLUMN IF NOT EXISTS poster_url text,
ADD COLUMN IF NOT EXISTS source_resolution text;