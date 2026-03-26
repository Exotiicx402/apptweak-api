CREATE TABLE public.appsflyer_event_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  media_source text NOT NULL,
  event_name text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (date, media_source, event_name)
);

ALTER TABLE public.appsflyer_event_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read appsflyer_event_cache" ON public.appsflyer_event_cache FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert appsflyer_event_cache" ON public.appsflyer_event_cache FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update appsflyer_event_cache" ON public.appsflyer_event_cache FOR UPDATE TO public USING (true);