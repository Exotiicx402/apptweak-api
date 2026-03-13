-- Add name column for AI-generated title to creative_requests
ALTER TABLE public.creative_requests 
ADD COLUMN name text;

-- Update existing records to have a placeholder name based on description
UPDATE public.creative_requests 
SET name = CASE 
  WHEN description IS NOT NULL THEN LEFT(description, 60)
  ELSE 'Creative Request'
END
WHERE name IS NULL;