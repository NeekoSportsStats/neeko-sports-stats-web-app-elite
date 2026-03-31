/*
  # Add cron schedule for generate-player-ranking-recos

  ## Purpose
  Schedules the ranking AI generation function to run nightly during season,
  batching through all 594 players over multiple invocations.

  ## Schedule
  - Every night at 3:10 AM UTC (Melbourne ~1:10 PM AEDT)
  - Runs every 2 minutes between 3:10–4:00 AM for burst filling
  - Matches existing project pattern (uses net.http_post to Supabase functions URL)

  ## Notes
  - Does NOT modify the existing afl_worker_loop cron
  - Uses batch_size=15 per invocation — fills 594 players in ~40 invocations
  - The edge function skips rows already generated with matching input_hash
*/

SELECT cron.schedule(
  'ranking_recos_nightly_fill',
  '10 3 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.settings.supabase_url', true) || '/functions/v1/generate-player-ranking-recos'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('batch_size', 15)
  );
  $$
);
