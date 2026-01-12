-- Create sync_logs table to track BigQuery sync operations
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('unity', 'snapchat')),
  sync_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  rows_affected INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying by source and date
CREATE INDEX idx_sync_logs_source ON public.sync_logs(source);
CREATE INDEX idx_sync_logs_created_at ON public.sync_logs(created_at DESC);

-- Enable RLS (but allow public read/write for edge functions)
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow public access since edge functions use service role key
CREATE POLICY "Allow public read access to sync_logs"
ON public.sync_logs FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to sync_logs"
ON public.sync_logs FOR INSERT
WITH CHECK (true);