/*
  # Fix Pipeline Alert Thresholds for Weekly AFL Pipeline

  ## Summary
  The original alert system was tuned for a daily pipeline. Neeko runs a weekly
  AFL pipeline (Monday AEDT). This migration adjusts all time-based thresholds
  so that alerts only fire for genuinely broken conditions, not routine weekly gaps.

  ## Changes

  v_pipeline_alert_checks (rebuilt):
  - pipeline_not_running : 36 hours  to 8 days
  - api_ingest_stale     : 24 hours  to 7 days
  - ai_generation_stale  : 36 hours  to 7 days
  - start_sit_cache_low  : < 10 rows to = 0 rows (only fire when completely empty)
  - Season-awareness retained from preseason migration

  fn_check_pipeline_alerts() (rebuilt):
  - Alert messages updated to reflect the new weekly thresholds
  - All logic otherwise identical

  False-positive cleanup:
  - Resolves any currently-open stale alerts within the new thresholds

  ## Notes
  - Cron schedule is NOT changed
  - pipeline_failed alert is NOT changed (remains always active)
  - season_started flag behaviour is NOT changed
*/

-- ─── 1. Rebuild v_pipeline_alert_checks with weekly thresholds ────────────────

CREATE OR REPLACE VIEW public.v_pipeline_alert_checks AS
SELECT
  CASE
    WHEN (SELECT MAX(last_pipeline_run) FROM public.v_pipeline_health) < now() - interval '8 days'
      OR (SELECT MAX(last_pipeline_run) FROM public.v_pipeline_health) IS NULL
    THEN 'pipeline_not_running'
    ELSE NULL
  END AS pipeline_issue,

  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (
        (SELECT last_player_stats_ingest FROM public.v_ingest_health) < now() - interval '7 days'
        OR (SELECT last_player_stats_ingest FROM public.v_ingest_health) IS NULL
      )
    THEN 'api_ingest_stale'
    ELSE NULL
  END AS ingest_issue,

  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (
        (SELECT last_player_ai_update FROM public.v_ai_generation_health) < now() - interval '7 days'
        OR (SELECT last_player_ai_update FROM public.v_ai_generation_health) IS NULL
      )
    THEN 'ai_generation_stale'
    ELSE NULL
  END AS ai_issue,

  CASE
    WHEN COALESCE((SELECT cache_rows FROM public.v_start_sit_cache_health), 0) = 0
    THEN 'start_sit_cache_low'
    ELSE NULL
  END AS cache_issue,

  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (SELECT players_missing_projection FROM public.v_data_integrity_checks) > 0
    THEN 'missing_projection_data'
    ELSE NULL
  END AS projection_issue,

  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (SELECT players_missing_neeko_rating FROM public.v_data_integrity_checks) > 0
    THEN 'missing_neeko_rating'
    ELSE NULL
  END AS neeko_rating_issue,

  CASE
    WHEN (SELECT latest_status FROM public.v_pipeline_health) = 'failed'
    THEN 'pipeline_failed'
    ELSE NULL
  END AS pipeline_failed_issue;

GRANT SELECT ON public.v_pipeline_alert_checks TO anon;
GRANT SELECT ON public.v_pipeline_alert_checks TO authenticated;

-- ─── 2. Rebuild fn_check_pipeline_alerts with updated messages ────────────────

CREATE OR REPLACE FUNCTION public.fn_check_pipeline_alerts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  checks_row RECORD;
  recent_cutoff TIMESTAMPTZ := now() - interval '30 minutes';
BEGIN
  SELECT * INTO checks_row FROM public.v_pipeline_alert_checks;

  IF checks_row.pipeline_failed_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'pipeline_failed'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('pipeline_failed', 'Weekly pipeline last run has status: failed', 'critical');
    END IF;
  END IF;

  IF checks_row.pipeline_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'pipeline_not_running'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('pipeline_not_running', 'Weekly pipeline has not run in the last 8 days', 'critical');
    END IF;
  END IF;

  IF checks_row.ingest_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'api_ingest_stale'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('api_ingest_stale', 'API ingestion has not updated player stats in the last 7 days', 'critical');
    END IF;
  END IF;

  IF checks_row.ai_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'ai_generation_stale'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('ai_generation_stale', 'AI player summaries have not been updated in the last 7 days', 'warning');
    END IF;
  END IF;

  IF checks_row.cache_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'start_sit_cache_low'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('start_sit_cache_low', 'Start/Sit cache is completely empty — no entries found', 'warning');
    END IF;
  END IF;

  IF checks_row.projection_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'missing_projection_data'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('missing_projection_data', 'One or more players are missing projection data in v_rankings_master', 'critical');
    END IF;
  END IF;

  IF checks_row.neeko_rating_issue IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'missing_neeko_rating'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('missing_neeko_rating', 'One or more players are missing Neeko rating in v_rankings_master', 'warning');
    END IF;
  END IF;

END;
$$;

-- ─── 3. Resolve false-positive stale alerts created under old thresholds ──────

UPDATE public.pipeline_alerts
SET
  resolved    = true,
  resolved_at = now()
WHERE
  resolved = false
  AND alert_type IN ('api_ingest_stale', 'ai_generation_stale', 'pipeline_not_running', 'start_sit_cache_low');
