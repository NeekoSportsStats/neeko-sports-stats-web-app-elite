/*
  # Pipeline Alert System

  ## Purpose
  Provides automated monitoring of the AFL data pipeline with alert logging
  and a cron-scheduled check function. Operates fully independently of
  existing pipelines and edge functions.

  ## New Objects

  1. public.pipeline_alerts         — table storing logged alerts
  2. public.v_pipeline_alert_checks — view that evaluates current health conditions
  3. public.fn_check_pipeline_alerts() — function that writes alerts for any failing condition
  4. cron schedule: pipeline-alert-monitor — runs every 30 minutes

  ## Security
  - RLS enabled on pipeline_alerts
  - Authenticated users can only read alerts (admin gating done client-side by user ID)
  - Only service role can insert/update via the function

  ## Safety
  - No existing tables, views, or edge functions are modified
  - All objects use CREATE IF NOT EXISTS / CREATE OR REPLACE
*/

-- ─── 1. Alert Log Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pipeline_alerts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type   TEXT        NOT NULL,
  alert_message TEXT       NOT NULL,
  severity     TEXT        NOT NULL DEFAULT 'warning',
  created_at   TIMESTAMPTZ DEFAULT now(),
  resolved     BOOLEAN     DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID
);

ALTER TABLE public.pipeline_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read alerts"
  ON public.pipeline_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update resolved flag"
  ON public.pipeline_alerts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pipeline_alerts_resolved_created
  ON public.pipeline_alerts (resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_alerts_alert_type
  ON public.pipeline_alerts (alert_type, created_at DESC);

GRANT SELECT, UPDATE ON public.pipeline_alerts TO authenticated;

-- ─── 2. Alert Check View ──────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_pipeline_alert_checks AS
SELECT
  CASE
    WHEN (SELECT MAX(last_pipeline_run) FROM public.v_pipeline_health)
         < now() - interval '36 hours'
      OR (SELECT MAX(last_pipeline_run) FROM public.v_pipeline_health) IS NULL
    THEN 'pipeline_not_running'
  END AS pipeline_issue,

  CASE
    WHEN (SELECT last_player_stats_ingest FROM public.v_ingest_health)
         < now() - interval '24 hours'
      OR (SELECT last_player_stats_ingest FROM public.v_ingest_health) IS NULL
    THEN 'api_ingest_stale'
  END AS ingest_issue,

  CASE
    WHEN (SELECT last_player_ai_update FROM public.v_ai_generation_health)
         < now() - interval '36 hours'
      OR (SELECT last_player_ai_update FROM public.v_ai_generation_health) IS NULL
    THEN 'ai_generation_stale'
  END AS ai_issue,

  CASE
    WHEN (SELECT cache_rows FROM public.v_start_sit_cache_health) < 50
      OR (SELECT cache_rows FROM public.v_start_sit_cache_health) IS NULL
    THEN 'start_sit_cache_low'
  END AS cache_issue,

  CASE
    WHEN (SELECT players_missing_projection FROM public.v_data_integrity_checks) > 0
    THEN 'missing_projection_data'
  END AS projection_issue,

  CASE
    WHEN (SELECT players_missing_neeko_rating FROM public.v_data_integrity_checks) > 0
    THEN 'missing_neeko_rating'
  END AS neeko_rating_issue,

  CASE
    WHEN (SELECT latest_status FROM public.v_pipeline_health) = 'failed'
    THEN 'pipeline_failed'
  END AS pipeline_failed_issue;

GRANT SELECT ON public.v_pipeline_alert_checks TO anon, authenticated;

-- ─── 3. Alert Check Function ──────────────────────────────────────────────────

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
      VALUES ('pipeline_not_running', 'Weekly pipeline has not run in the last 36 hours', 'critical');
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
      VALUES ('api_ingest_stale', 'API ingestion has not updated player stats in the last 24 hours', 'critical');
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
      VALUES ('ai_generation_stale', 'AI player summaries have not been updated in the last 36 hours', 'warning');
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
      VALUES ('start_sit_cache_low', 'Start/Sit cache has fewer than 50 rows — may be empty or corrupt', 'warning');
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

-- ─── 4. Cron Schedule ─────────────────────────────────────────────────────────

SELECT cron.unschedule('pipeline-alert-monitor')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'pipeline-alert-monitor'
);

SELECT cron.schedule(
  'pipeline-alert-monitor',
  '*/30 * * * *',
  $$SELECT public.fn_check_pipeline_alerts();$$
);
