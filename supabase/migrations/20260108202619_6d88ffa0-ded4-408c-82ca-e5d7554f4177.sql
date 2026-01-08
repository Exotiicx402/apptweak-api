-- Create hourly cron job for Polymarket rank sync to Google Sheets
SELECT cron.schedule(
  'polymarket-rank-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://agususzieosizftucxxq.supabase.co/functions/v1/apptweak-rank-to-sheets',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);