/*
  # Replace ranking recos cron with Monday 3-4 AM UTC window

  ## Summary
  Replaces the previous nightly cron with a Monday-only schedule that runs
  every minute from 3:00 to 3:59 AM UTC (17:00-17:59 AEST Monday).
  This processes 50 players per invocation — the full 594-player roster
  completes across ~12 invocations within the window.

  ## Changes
  - Unschedules any previous ranking recos cron jobs
  - Schedules generate-ranking-ai to run every minute on Monday 3-4 AM UTC
  - Cron expression: * 3 * * 1 (every minute of the 3 AM hour, Mondays only)

  ## Notes
  - Each run processes up to 50 players (from v_ai_rankings_generation_queue)
  - Staleness check: players with updated_at > 3 days are regenerated
  - Players already fresh are skipped automatically by the queue view
*/

SELECT cron.unschedule('ranking_recos_nightly_fill');

SELECT cron.schedule(
  'generate-ranking-ai',
  '* 3 * * 1',
  $$
  SELECT
    net.http_post(
      url     := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/generate-player-ranking-recos',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);
