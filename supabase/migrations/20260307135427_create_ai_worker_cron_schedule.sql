/*
  # Create AI Worker Cron Schedule

  ## Summary
  Schedules the generate-ai-worker edge function to run every 15 seconds,
  polling the ai_generation_queue for pending jobs.

  ## Notes
  - Uses pg_cron + pg_net to POST to the deployed edge function
  - Replaces any existing schedule with the same name to prevent duplicates
  - The worker is idempotent — safe to call when the queue is empty
*/

SELECT cron.unschedule('ai_worker_loop') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ai_worker_loop'
);

SELECT cron.schedule(
  'ai_worker_loop',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/generate-ai-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
