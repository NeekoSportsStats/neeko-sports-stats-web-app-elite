/*
  # Add 60-minute cron for refresh_projection_accuracy

  ## Purpose
  Ensures projection accuracy metrics are refreshed automatically every hour
  throughout the season so the homepage always reflects the latest completed games.

  ## Schedule
  - Every 60 minutes via pg_cron
  - Calls public.refresh_projection_accuracy() which is an incremental upsert
    (ON CONFLICT DO NOTHING — safe to run repeatedly)
  - Replaces any prior job with the same name to avoid duplicates
*/

SELECT cron.unschedule('refresh-projection-accuracy')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-projection-accuracy'
);

SELECT cron.schedule(
  'refresh-projection-accuracy',
  '*/60 * * * *',
  $$SELECT public.refresh_projection_accuracy();$$
);
