/*
  # Step 5 — Fix fn_check_pipeline_alerts Broken View Reference

  ## Problem
  `fn_check_pipeline_alerts()` references `public.v_pipeline_alert_checks` which
  does not exist. Every call errors with:
    "relation "public.v_pipeline_alert_checks" does not exist"

  ## Fix
  Rewrite `fn_check_pipeline_alerts()` to read directly from real tables:
    - public.pipeline_runs   — for pipeline failure/staleness checks
    - public.ai_player_content — for AI generation staleness
    - public.start_sit_cache  — for cache health
    - afl.player_rankings_cache — for missing projection/neeko_rating data

  All alert INSERT logic is preserved exactly. Only the data source changes
  from the missing view to direct table queries.

  ## No changes to
  - Alert types or severities
  - public.pipeline_alerts table structure
  - Any RPC signatures
*/

CREATE OR REPLACE FUNCTION public.fn_check_pipeline_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  recent_cutoff timestamptz := now() - interval '30 minutes';

  v_pipeline_failed    boolean := false;
  v_pipeline_stale     boolean := false;
  v_ingest_stale       boolean := false;
  v_ai_stale           boolean := false;
  v_cache_empty        boolean := false;
  v_missing_projection boolean := false;
  v_missing_neeko      boolean := false;
BEGIN

  -- Pipeline failed: last run has status 'failed' or 'error'
  SELECT EXISTS(
    SELECT 1 FROM public.pipeline_runs
    WHERE status IN ('failed', 'error')
    ORDER BY started_at DESC
    LIMIT 1
  ) INTO v_pipeline_failed;

  -- Pipeline stale: no completed run in the last 8 days
  SELECT NOT EXISTS(
    SELECT 1 FROM public.pipeline_runs
    WHERE status = 'complete'
      AND started_at > now() - interval '8 days'
  ) INTO v_pipeline_stale;

  -- Ingest stale: no player_games data updated in last 7 days
  SELECT NOT EXISTS(
    SELECT 1 FROM afl.player_games
    WHERE season = EXTRACT(year FROM now())::integer
    LIMIT 1
  ) INTO v_ingest_stale;

  -- AI stale: no ai_player_content generated in last 7 days
  SELECT NOT EXISTS(
    SELECT 1 FROM public.ai_player_content
    WHERE generated_at > now() - interval '7 days'
    LIMIT 1
  ) INTO v_ai_stale;

  -- Cache empty: start_sit_cache has no rows
  SELECT (COUNT(*) = 0) FROM public.start_sit_cache INTO v_cache_empty;

  -- Missing projection: players in rankings cache with no projection
  SELECT EXISTS(
    SELECT 1 FROM afl.player_rankings_cache
    WHERE projection_final IS NULL OR projection_final = 0
    LIMIT 1
  ) INTO v_missing_projection;

  -- Missing neeko rating
  SELECT EXISTS(
    SELECT 1 FROM afl.player_rankings_cache
    WHERE neeko_rating IS NULL OR neeko_rating = 0
    LIMIT 1
  ) INTO v_missing_neeko;

  -- Insert alerts (deduped against recent window)
  IF v_pipeline_failed THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'pipeline_failed'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('pipeline_failed', 'Pipeline last run has status: failed', 'critical');
    END IF;
  END IF;

  IF v_pipeline_stale THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'pipeline_not_running'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('pipeline_not_running', 'Pipeline has not run successfully in the last 8 days', 'critical');
    END IF;
  END IF;

  IF v_ingest_stale THEN
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

  IF v_ai_stale THEN
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

  IF v_cache_empty THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'start_sit_cache_low'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('start_sit_cache_low', 'Start/Sit cache is completely empty', 'warning');
    END IF;
  END IF;

  IF v_missing_projection THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'missing_projection_data'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('missing_projection_data', 'One or more players are missing projection data in rankings cache', 'critical');
    END IF;
  END IF;

  IF v_missing_neeko THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'missing_neeko_rating'
        AND resolved = false
        AND created_at > recent_cutoff
    ) THEN
      INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
      VALUES ('missing_neeko_rating', 'One or more players are missing Neeko rating in rankings cache', 'warning');
    END IF;
  END IF;

END;
$$;
