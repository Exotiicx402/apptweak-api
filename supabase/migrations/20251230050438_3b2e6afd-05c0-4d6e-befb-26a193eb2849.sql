-- Create table for storing app downloads history
CREATE TABLE public.app_downloads_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL,
  date DATE NOT NULL,
  downloads INTEGER,
  country TEXT DEFAULT 'us',
  device TEXT DEFAULT 'iphone',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(app_id, date, country, device)
);

-- Create table for storing app rankings history
CREATE TABLE public.app_rankings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL,
  date DATE NOT NULL,
  rank INTEGER,
  category TEXT NOT NULL,
  category_name TEXT,
  chart_type TEXT DEFAULT 'free',
  country TEXT DEFAULT 'us',
  device TEXT DEFAULT 'iphone',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(app_id, date, category, chart_type, country, device)
);

-- Create table for storing app metadata (name, icon)
CREATE TABLE public.app_metadata (
  app_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_downloads_app_date ON public.app_downloads_history(app_id, date);
CREATE INDEX idx_rankings_app_date ON public.app_rankings_history(app_id, date);

-- Disable RLS for these tables (internal/admin data)
ALTER TABLE public.app_downloads_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_rankings_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_metadata DISABLE ROW LEVEL SECURITY;