
/*
  # Pipeline Observability View — B4 hardening

  ## Purpose
  Single-source-of-truth health surface for the operator console.
  Surfaces actionable warnings automatically, replacing ad-hoc spot-checks.

  ## What it surfaces
  1. Latest run per pipeline key — status, duration, step completion
  2. Raw ingest freshness   (afl.raw_player_stats.updated_at)
  3. Player games coverage  (distinct game_ids / max week in afl.player_games)
  4. Rankings cache freshness (afl.player_rankings_cache.cached_at)
  5. Orphaned completed games — FT games with zero player_games rows
  6. Cron job last-run adherence — flags daily jobs not fired within 26 h
  7. Summary warning list — human-readable operator alerts

  ## New objects
  - public.v_pipeline_observability  (view, service_role read only)
  - public.get_pipeline_health()     (admin-gated RPC for the frontend)

  ## Notes
  - afl.player_games has no timestamp column; freshness is proxied from
    afl.raw_player_stats.updated_at (same ingestion cycle).
  - Rankings cache freshness uses cached_at (not updated_at).
*/

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Drop and recreate the view
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_pipeline_observability CASCADE;

CREATE VIEW public.v_pipeline_observability AS
WITH

-- Latest run per pipeline key
latest_runs AS (
  SELECT DISTINCT ON (pipeline_key)
    pipeline_key,
    id              AS run_id,
    label           AS pipeline_label,
    status          AS run_status,
    total_tasks,
    completed_tasks,
    started_at,
    finished_at,
    duration_ms,
    current_step_label
  FROM public.pipeline_runs
  ORDER BY pipeline_key, started_at DESC
),

-- Step summary for each latest run
step_summary AS (
  SELECT
    ps.run_id,
    COUNT(*) FILTER (WHERE ps.status = 'success') AS steps_ok,
    COUNT(*) FILTER (WHERE ps.status = 'error')   AS steps_err,
    COUNT(*) FILTER (WHERE ps.status = 'warning') AS steps_warn,
    COUNT(*)                                       AS steps_total
  FROM public.pipeline_steps ps
  GROUP BY ps.run_id
),

-- Raw ingest freshness
raw_freshness AS (
  SELECT
    COUNT(*)::integer                                          AS total_raw_rows,
    MAX(updated_at)                                            AS last_raw_updated_at,
    EXTRACT(EPOCH FROM (now() - MAX(updated_at))) / 3600.0    AS raw_hours_stale
  FROM afl.raw_player_stats
  WHERE season = 2026
),

-- Player games coverage (no timestamp on the table; use max week as proxy)
pg_coverage AS (
  SELECT
    COUNT(DISTINCT game_id)::integer    AS total_games_synced,
    COUNT(*)::integer                   AS total_player_game_rows,
    MAX(week)::integer                  AS max_week_synced,
    MAX(season)::integer                AS max_season_synced
  FROM afl.player_games
  WHERE season = 2026
),

-- Rankings cache freshness
cache_freshness AS (
  SELECT
    COUNT(*)::integer                                           AS cached_players,
    MAX(cached_at)                                             AS cache_last_rebuilt_at,
    EXTRACT(EPOCH FROM (now() - MAX(cached_at))) / 3600.0     AS cache_hours_stale
  FROM afl.player_rankings_cache
),

-- Orphaned completed games (FT status, 2026 season, zero player_games rows)
orphaned_games AS (
  SELECT COUNT(DISTINCT g.game_id)::integer AS orphaned_count
  FROM afl.games_raw g
  WHERE g.status_short = 'FT'
    AND g.season = 2026
    AND NOT EXISTS (
      SELECT 1 FROM afl.player_games pg WHERE pg.game_id = g.game_id
    )
),

-- Cron last-run adherence (stage* daily jobs flagged if > 26 h overdue)
cron_adherence AS (
  SELECT
    j.jobname,
    j.schedule,
    MAX(jrd.end_time)                                          AS last_ran_at,
    EXTRACT(EPOCH FROM (now() - MAX(jrd.end_time))) / 3600.0  AS hours_since_ran,
    CASE
      WHEN j.schedule NOT LIKE '*/5%'
           AND EXTRACT(EPOCH FROM (now() - MAX(jrd.end_time))) / 3600.0 > 26
        THEN true
      ELSE false
    END                                                        AS overdue
  FROM cron.job j
  LEFT JOIN cron.job_run_details jrd ON jrd.jobid = j.jobid
  WHERE j.jobname LIKE 'stage%'
  GROUP BY j.jobname, j.schedule
),

-- Aggregate warning messages
warnings AS (
  SELECT array_remove(ARRAY[
    CASE WHEN rf.raw_hours_stale > 26
      THEN 'RAW STALE: raw_player_stats not updated for ' || ROUND(rf.raw_hours_stale::numeric, 1) || 'h'
    END,
    CASE WHEN cf.cache_hours_stale > 26
      THEN 'CACHE STALE: rankings cache not rebuilt for ' || ROUND(cf.cache_hours_stale::numeric, 1) || 'h'
    END,
    CASE WHEN og.orphaned_count > 0
      THEN 'ORPHANS: ' || og.orphaned_count || ' completed game(s) have no player_games rows'
    END,
    CASE WHEN rf.raw_hours_stale < 26 AND cf.cache_hours_stale > 26
      THEN 'LAG: Raw data fresh but rankings cache is stale — cache rebuild may have failed'
    END,
    CASE WHEN (SELECT COUNT(*) FROM cron_adherence WHERE overdue) > 0
      THEN 'CRON OVERDUE: ' || (
        SELECT STRING_AGG(jobname, ', ' ORDER BY jobname)
        FROM cron_adherence WHERE overdue
      ) || ' have not run in 26h+'
    END
  ], NULL) AS warning_list
  FROM raw_freshness rf, cache_freshness cf, orphaned_games og
)

SELECT
  -- Timestamp
  now()                                     AS observed_at,

  -- Overall health signal
  CASE
    WHEN w.warning_list IS NULL OR array_length(w.warning_list, 1) = 0 THEN 'healthy'
    WHEN array_length(w.warning_list, 1) >= 3                          THEN 'critical'
    ELSE 'warning'
  END                                       AS overall_health,
  w.warning_list,

  -- Raw ingest
  rf.total_raw_rows,
  rf.last_raw_updated_at,
  ROUND(rf.raw_hours_stale::numeric, 1)    AS raw_hours_stale,

  -- Player games coverage
  pgc.total_games_synced,
  pgc.total_player_game_rows,
  pgc.max_week_synced,

  -- Rankings cache
  cf.cached_players,
  cf.cache_last_rebuilt_at,
  ROUND(cf.cache_hours_stale::numeric, 1) AS cache_hours_stale,

  -- Orphaned games
  og.orphaned_count                        AS orphaned_ft_games,

  -- Ingestion pipeline latest run
  lr_ing.run_id                            AS ingestion_run_id,
  lr_ing.run_status                        AS ingestion_status,
  lr_ing.started_at                        AS ingestion_started_at,
  lr_ing.finished_at                       AS ingestion_finished_at,
  lr_ing.duration_ms                       AS ingestion_duration_ms,
  lr_ing.completed_tasks                   AS ingestion_steps_completed,
  lr_ing.total_tasks                       AS ingestion_steps_total,
  ss_ing.steps_ok                          AS ingestion_steps_ok,
  ss_ing.steps_err                         AS ingestion_steps_err,
  ss_ing.steps_warn                        AS ingestion_steps_warn,
  lr_ing.current_step_label                AS ingestion_last_step_label,

  -- Neeko full pipeline
  lr_nk.run_status                         AS neeko_pipeline_status,
  lr_nk.started_at                         AS neeko_pipeline_started_at,
  lr_nk.completed_tasks                    AS neeko_pipeline_steps_completed,
  lr_nk.total_tasks                        AS neeko_pipeline_steps_total,
  ss_nk.steps_err                          AS neeko_pipeline_steps_err,

  -- Neeko AI pipeline
  lr_ai.run_status                         AS neeko_ai_status,
  lr_ai.started_at                         AS neeko_ai_started_at,
  lr_ai.completed_tasks                    AS neeko_ai_steps_completed,

  -- Cron adherence (serialised)
  (
    SELECT jsonb_agg(jsonb_build_object(
      'job',         ca.jobname,
      'schedule',    ca.schedule,
      'last_ran_at', ca.last_ran_at,
      'hours_since', ROUND(ca.hours_since_ran::numeric, 1),
      'overdue',     ca.overdue
    ) ORDER BY ca.jobname)
    FROM cron_adherence ca
  )                                        AS cron_status

FROM warnings w
CROSS JOIN raw_freshness rf
CROSS JOIN pg_coverage pgc
CROSS JOIN cache_freshness cf
CROSS JOIN orphaned_games og
LEFT JOIN latest_runs lr_ing ON lr_ing.pipeline_key = 'afl_ingestion'
LEFT JOIN step_summary  ss_ing ON ss_ing.run_id = lr_ing.run_id
LEFT JOIN latest_runs lr_nk  ON lr_nk.pipeline_key  = 'neeko_full_pipeline'
LEFT JOIN step_summary  ss_nk ON ss_nk.run_id = lr_nk.run_id
LEFT JOIN latest_runs lr_ai  ON lr_ai.pipeline_key  = 'neeko_ai';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Admin-gated RPC wrapper
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_pipeline_health();

CREATE OR REPLACE FUNCTION public.get_pipeline_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'cron'
AS $$
DECLARE
  v_role   text;
  v_result jsonb;
BEGIN
  v_role := coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role'
  );

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT row_to_json(obs)::jsonb
  INTO v_result
  FROM public.v_pipeline_observability obs;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Grants — view locked to service_role; RPC open to authenticated (admin check inside)
-- ────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.v_pipeline_observability FROM anon, authenticated;
GRANT SELECT ON public.v_pipeline_observability TO service_role;

GRANT EXECUTE ON FUNCTION public.get_pipeline_health() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_health() FROM anon;
