/*
  # Schedule Weekly AFL Pipeline — Monday 02:00 UTC (12:00 AEDT / 13:00 AEST)

  ## Purpose
  Schedules the weekly-afl-pipeline edge function to run automatically every
  Monday morning after AFL data from the weekend round is available.

  ## Schedule Details
  - Cron expression: `0 2 * * 1`
  - UTC time: Monday 02:00 UTC
  - AEDT (UTC+11, Oct–Apr): Monday 13:00 AEDT  ← active during AFL season
  - AEST (UTC+10, Apr–Oct): Monday 12:00 AEST
  - This window ensures Sunday evening matches have finished and API data
    has propagated before the pipeline runs.

  ## What the pipeline does (in order)
  1. Triggers AFL API ingest workers (matches, player stats, team stats)
  2. Detects the latest completed round
  3. Transforms raw data → canonical tables
  4. Rebuilds team defence profiles
  5. Refreshes Neeko intelligence scores
  6. Regenerates AI rankings and recommendations
  7. Clears stale Start/Sit cache entries (older than 6 days)

  ## Safety
  - If job already exists it is unscheduled first, then recreated
  - Uses current_setting('app.supabase_url') and ('app.service_role_key')
    which are set automatically by Supabase in the cron execution context
*/

SELECT cron.unschedule('weekly-afl-pipeline')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-afl-pipeline'
);

SELECT cron.schedule(
  'weekly-afl-pipeline',
  '0 2 * * 1',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/weekly-afl-pipeline',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object('season', 2026)
  );
  $$
);
