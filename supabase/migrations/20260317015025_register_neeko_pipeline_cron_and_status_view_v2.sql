
/*
  # Register neeko_full_pipeline cron job + admin.v_pipeline_status view

  ## Summary
  1. Schedules public.run_neeko_pipeline() via pg_cron at 3:00 AM Melbourne time.
     Melbourne AEDT = UTC+11 → 3:00 AM AEDT = 16:00 UTC (previous day).
     The cron expression '0 16 * * *' fires daily at 16:00 UTC.

  2. Creates admin.v_pipeline_status surfacing:
     - last_run                — timestamp of most recent neeko_full_pipeline run
     - last_run_finished       — when it completed
     - last_run_status         — complete | partial | running | error
     - last_projection_refresh — when player_projection was last generated
     - last_ai_generation      — when AI analysis was last written
     - players_processed       — count of players in current projection
     - ai_rows_generated       — AI analysis rows generated in the last 7 days

  ## Notes
  - Replaces any existing neeko_full_pipeline cron job safely
  - No tables dropped
*/

-- ============================================================
-- STEP 3: Register / replace cron job
-- 3:00 AM Melbourne AEDT = 16:00 UTC
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'neeko_full_pipeline') THEN
    PERFORM cron.unschedule('neeko_full_pipeline');
  END IF;
END $$;

SELECT cron.schedule(
  'neeko_full_pipeline',
  '0 16 * * *',
  $$ SELECT public.run_neeko_pipeline(); $$
);

-- ============================================================
-- STEP 4: admin.v_pipeline_status
-- ============================================================
CREATE OR REPLACE VIEW admin.v_pipeline_status AS
WITH last_run AS (
  SELECT
    started_at,
    finished_at,
    status,
    pipeline_key,
    ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
  FROM public.pipeline_runs
  WHERE pipeline_key = 'neeko_full_pipeline'
),
last_projection AS (
  SELECT MAX(generated_at) AS last_refresh
  FROM afl.player_projection
),
last_ai AS (
  SELECT MAX(generated_at) AS last_ai_gen
  FROM ai.player_ai_analysis
),
players_count AS (
  SELECT COUNT(*) AS cnt FROM afl.player_projection
),
ai_rows AS (
  SELECT COUNT(*) AS cnt
  FROM ai.player_ai_analysis
  WHERE generated_at >= now() - interval '7 days'
)
SELECT
  lr.started_at        AS last_run,
  lr.finished_at       AS last_run_finished,
  lr.status            AS last_run_status,
  lp.last_refresh      AS last_projection_refresh,
  la.last_ai_gen       AS last_ai_generation,
  pc.cnt               AS players_processed,
  ar.cnt               AS ai_rows_generated
FROM last_run lr
CROSS JOIN last_projection lp
CROSS JOIN last_ai la
CROSS JOIN players_count pc
CROSS JOIN ai_rows ar
WHERE lr.rn = 1;

GRANT SELECT ON admin.v_pipeline_status TO authenticated;
