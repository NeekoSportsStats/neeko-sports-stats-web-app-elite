/*
  # Create pg_cron schedule for generate-all-ai

  Runs every minute during the 03:00–03:59 UTC window each day.
  Cron expression: * 3 * * *

  Calls the generate-all-ai edge function via net.http_post.
  Uses the service role key from vault/env — the URL is constructed
  from the project reference embedded in the Supabase URL.

  If the job already exists it is dropped and recreated to ensure
  the schedule and target are correct.
*/

SELECT cron.unschedule('generate-all-ai')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-all-ai'
);

SELECT cron.schedule(
  'generate-all-ai',
  '* 3 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/generate-all-ai',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body   := '{}'::jsonb
  );
  $$
);
