-- Delete duplicates, keeping the first one
DELETE FROM public.creative_requests 
WHERE id IN ('665b5db1-6ea4-419b-9274-d225849506ec', 'e3dfd5aa-6fee-43a8-aa58-13d72789e3f5');

-- Now add unique constraint
ALTER TABLE public.creative_requests ADD CONSTRAINT creative_requests_message_ts_unique UNIQUE (message_ts);