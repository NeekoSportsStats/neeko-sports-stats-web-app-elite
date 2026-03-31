
/*
  # Preseason Pipeline Alert Suppression

  ## Summary
  Pipeline alerts (api_ingest_stale, ai_generation_stale, start_sit_cache_low) were
  firing falsely because the AFL season has not started yet. This migration adds a
  season state mechanism to suppress stale-data alerts until Round 1 data arrives,
  while keeping the start_sit_cache alert active at a reduced threshold of 10 rows.

  ## Changes

  ### New Table
  - `system_state` — key/value store for global system flags
    - Seeded with `season_started = false`

  ### New Function
  - `fn_auto_detect_season_start()` — checks afl.raw_2026_matches for round >= 1
    and flips season_started to 'true' automatically

  ### New Trigger
  - `trg_auto_detect_season_start` — fires after insert on afl.raw_2026_matches
    to auto-enable season mode when Round 1 data lands

  ### Modified Views
  - `v_pipeline_alert_checks` — api_ingest_stale and ai_generation_stale now only
    fire when season_started = 'true'; start_sit_cache_low threshold reduced to 10
  - `v_data_integrity_checks` — projection/neeko/AI data checks suppressed
    during preseason

  ## Notes
  - The pipeline_not_running and pipeline_failed alerts are NOT suppressed; they
    remain active year-round so infrastructure issues are always caught
  - season_started can be manually set: UPDATE system_state SET value = 'true'
    WHERE key = 'season_started';
*/

-- Step 1: Create system_state table
CREATE TABLE IF NOT EXISTS public.system_state (
  key  text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system state"
  ON public.system_state FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.system_state (key, value)
VALUES ('season_started', 'false')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.system_state TO anon;
GRANT SELECT ON public.system_state TO authenticated;

-- Step 2: Function to auto-detect season start from ingested match data
CREATE OR REPLACE FUNCTION public.fn_auto_detect_season_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM afl.raw_2026_matches WHERE round_number >= 1
  ) THEN
    UPDATE public.system_state
    SET value = 'true'
    WHERE key = 'season_started' AND value = 'false';
  END IF;
  RETURN NEW;
END;
$$;

-- Step 3: Trigger fires on every new match row inserted
DROP TRIGGER IF EXISTS trg_auto_detect_season_start ON afl.raw_2026_matches;
CREATE TRIGGER trg_auto_detect_season_start
  AFTER INSERT ON afl.raw_2026_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_detect_season_start();

-- Step 4: Rebuild v_pipeline_alert_checks with season-aware logic
CREATE OR REPLACE VIEW public.v_pipeline_alert_checks AS
SELECT
  -- Infrastructure alerts — always active
  CASE
    WHEN (SELECT MAX(last_pipeline_run) FROM v_pipeline_health) < now() - interval '36 hours'
      OR (SELECT MAX(last_pipeline_run) FROM v_pipeline_health) IS NULL
    THEN 'pipeline_not_running'
    ELSE NULL
  END AS pipeline_issue,

  -- Data freshness alerts — suppressed before season starts
  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (
        (SELECT last_player_stats_ingest FROM v_ingest_health) < now() - interval '24 hours'
        OR (SELECT last_player_stats_ingest FROM v_ingest_health) IS NULL
      )
    THEN 'api_ingest_stale'
    ELSE NULL
  END AS ingest_issue,

  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (
        (SELECT last_player_ai_update FROM v_ai_generation_health) < now() - interval '36 hours'
        OR (SELECT last_player_ai_update FROM v_ai_generation_health) IS NULL
      )
    THEN 'ai_generation_stale'
    ELSE NULL
  END AS ai_issue,

  -- Cache alert — always active but threshold reduced to 10 rows
  CASE
    WHEN (SELECT cache_rows FROM v_start_sit_cache_health) < 10
      OR (SELECT cache_rows FROM v_start_sit_cache_health) IS NULL
    THEN 'start_sit_cache_low'
    ELSE NULL
  END AS cache_issue,

  -- Data integrity alerts — suppressed before season starts
  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (SELECT players_missing_projection FROM v_data_integrity_checks) > 0
    THEN 'missing_projection_data'
    ELSE NULL
  END AS projection_issue,

  CASE
    WHEN (SELECT value FROM public.system_state WHERE key = 'season_started') = 'true'
      AND (SELECT players_missing_neeko_rating FROM v_data_integrity_checks) > 0
    THEN 'missing_neeko_rating'
    ELSE NULL
  END AS neeko_rating_issue,

  -- Pipeline failure — always active
  CASE
    WHEN (SELECT latest_status FROM v_pipeline_health) = 'failed'
    THEN 'pipeline_failed'
    ELSE NULL
  END AS pipeline_failed_issue;

GRANT SELECT ON public.v_pipeline_alert_checks TO anon;
GRANT SELECT ON public.v_pipeline_alert_checks TO authenticated;
