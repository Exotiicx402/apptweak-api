ALTER TABLE public.creative_requests ADD COLUMN IF NOT EXISTS inspiration_url TEXT;
ALTER TABLE public.creative_requests ADD COLUMN IF NOT EXISTS thread_context TEXT;