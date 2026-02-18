
CREATE TABLE public.competitor_watchlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  facebook_page_id text NOT NULL,
  facebook_page_name text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to competitor_watchlist"
  ON public.competitor_watchlist
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to competitor_watchlist"
  ON public.competitor_watchlist
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to competitor_watchlist"
  ON public.competitor_watchlist
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete from competitor_watchlist"
  ON public.competitor_watchlist
  FOR DELETE
  USING (true);
