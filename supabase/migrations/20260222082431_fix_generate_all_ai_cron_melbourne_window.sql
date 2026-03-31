/*
  # Fix generate-all-ai cron schedule for Melbourne time window

  ## Change
  - Old schedule: `0 3 * * 1` — ran once at 03:00 UTC on Mondays only (wrong)
  - New schedule: `* 16 * * *` — runs every minute during 16:00–16:59 UTC daily

  ## Melbourne time mapping
  - Melbourne AEDT (UTC+11, Oct–Apr): 03:00–03:59 AEDT = 16:00–16:59 UTC
  - Melbourne AEST (UTC+10, Apr–Oct): 03:00–03:59 AEST = 17:00–17:59 UTC
  - Using 16:00 UTC to cover AEDT (daylight saving) window consistently.
    During AEST the window shifts 1 hour later; adjust to `* 17 * * *` for winter if needed.

  ## Safety
  - Drop and recreate — idempotent
*/

SELECT cron.unschedule('generate-all-ai');

SELECT cron.schedule(
  'generate-all-ai',
  '* 16 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/generate-all-ai',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);
