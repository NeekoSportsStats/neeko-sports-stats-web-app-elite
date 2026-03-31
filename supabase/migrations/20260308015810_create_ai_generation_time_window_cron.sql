/*
  # AI Generation Controlled Time Window

  ## Purpose
  Ensures generate-ranking-ai only fires during a safe post-ingestion window.

  ## What this does
  1. Creates helper function run_ai_generation_if_window()
     - Checks current server time (UTC)
     - Only calls generate-ranking-ai if time is between 03:45 and 04:45 UTC
     - Exits silently outside that window
  2. Removes any existing ai-generation-window cron to avoid duplicates
  3. Schedules cron every 10 minutes — function enforces the window internally

  ## Execution window
  03:45 UTC → 04:45 UTC (post data ingestion at 03:00 UTC)

  ## Cost protection
  The worker itself also enforces MAX_PLAYERS_PER_RUN = 50 and hash-based
  change detection, so this is a second layer of defence.
*/

CREATE OR REPLACE FUNCTION public.run_ai_generation_if_window()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hour   int;
  current_minute int;
BEGIN
  current_hour   := EXTRACT(HOUR   FROM NOW() AT TIME ZONE 'UTC')::int;
  current_minute := EXTRACT(MINUTE FROM NOW() AT TIME ZONE 'UTC')::int;

  IF (current_hour = 3 AND current_minute >= 45)
  OR (current_hour = 4 AND current_minute <= 45)
  THEN
    PERFORM net.http_post(
      url     := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/generate-ranking-ai',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || vault.decrypted_secrets.decrypted_secret
      ),
      body    := '{}'::jsonb
    )
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  ELSE
    RAISE NOTICE 'AI generation skipped — outside allowed window (current UTC %:%)', current_hour, current_minute;
  END IF;
END;
$$;

SELECT cron.unschedule('ai-generation-window')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ai-generation-window'
);

SELECT cron.schedule(
  'ai-generation-window',
  '*/10 * * * *',
  $$ SELECT public.run_ai_generation_if_window(); $$
);
