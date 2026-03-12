CREATE TABLE public.creative_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  requester TEXT,
  platform TEXT DEFAULT 'Not specified',
  format TEXT DEFAULT 'Not specified',
  priority TEXT DEFAULT 'Normal',
  message_ts TEXT,
  source_channel TEXT DEFAULT 'C09HBDKSUGH',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to creative_requests" ON public.creative_requests FOR SELECT TO public USING (true);
CREATE POLICY "Allow service insert to creative_requests" ON public.creative_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow service update to creative_requests" ON public.creative_requests FOR UPDATE TO public USING (true);