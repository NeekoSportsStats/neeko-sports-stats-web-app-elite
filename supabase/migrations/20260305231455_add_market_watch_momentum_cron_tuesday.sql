/*
  # Market Watch Momentum Cron — Tuesday 04:00 UTC

  ## Summary
  Schedules the weekly market watch snapshot function to run every Tuesday
  at 04:00 UTC, after round data has been ingested (Monday pipeline runs
  at 05:00 UTC Monday). This ensures value history captures the post-round
  state for momentum calculations.

  ## Schedule
  - Job name : market_watch_tuesday_snapshot
  - Cron     : 0 4 * * 2  (Tuesday 04:00 UTC every week)
  - Function : market.build_market_watch_snapshot()

  ## Notes
  - Replaces or supplements the existing Monday 05:00 UTC cron (market_watch_weekly)
  - Both can coexist; the function is idempotent (ON CONFLICT DO UPDATE)
  - Safe to run multiple times per round
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('market_watch_tuesday_snapshot')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'market_watch_tuesday_snapshot'
);

SELECT cron.schedule(
  'market_watch_tuesday_snapshot',
  '0 4 * * 2',
  $cron$
    SELECT market.build_market_watch_snapshot();
  $cron$
);
