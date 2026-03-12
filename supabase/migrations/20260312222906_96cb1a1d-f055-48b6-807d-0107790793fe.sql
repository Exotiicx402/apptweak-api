CREATE TABLE public.scanner_state (
  id text PRIMARY KEY DEFAULT 'slack-creative-scanner',
  last_scanned_ts text NOT NULL DEFAULT '0',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.scanner_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read scanner_state" ON public.scanner_state FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert scanner_state" ON public.scanner_state FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update scanner_state" ON public.scanner_state FOR UPDATE TO public USING (true);

INSERT INTO public.scanner_state (id, last_scanned_ts) VALUES ('slack-creative-scanner', '0');