
/*
  # Fix v_pipeline_observability overall_health logic

  array_length('{}'::text[], 1) returns NULL (not 0), causing the
  "no warnings = healthy" branch to never fire.
  Use cardinality() instead, which correctly returns 0 for an empty array.

  Also adds ingestion_steps_completed vs ingestion_steps_total mismatch
  as an explicit warning (catches the pre-today regression where only 4/6
  steps ran but the pipeline reported 'complete').
*/

DROP VIEW IF EXISTS public.v_pipeline_observability CASCADE;

CREATE VIEW public.v_pipeline_observability AS
WITH

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

raw_freshness AS (
  SELECT
    COUNT(*)::integer                                       AS total_raw_rows,
    MAX(updated_at)                                         AS last_raw_updated_at,
    EXTRACT(EPOCH FROM (now() - MAX(updated_at))) / 3600.0 AS raw_hours_stale
  FROM afl.raw_player_stats
  WHERE season = 2026
),

pg_coverage AS (
  SELECT
    COUNT(DISTINCT game_id)::integer AS total_games_synced,
    COUNT(*)::integer                AS total_player_game_rows,
    MAX(week)::integer               AS max_week_synced
  FROM afl.player_games
  WHERE season = 2026
),

cache_freshness AS (
  SELECT
    COUNT(*)::integer                                        AS cached_players,
    MAX(cached_at)                                          AS cache_last_rebuilt_at,
    EXTRACT(EPOCH FROM (now() - MAX(cached_at))) / 3600.0  AS cache_hours_stale
  FROM afl.player_rankings_cache
),

orphaned_games AS (
  SELECT COUNT(DISTINCT g.game_id)::integer AS orphaned_count
  FROM afl.games_raw g
  WHERE g.status_short = 'FT'
    AND g.season = 2026
    AND NOT EXISTS (
      SELECT 1 FROM afl.player_games pg WHERE pg.game_id = g.game_id
    )
),

cron_adherence AS (
  SELECT
    j.jobname,
    j.schedule,
    MAX(jrd.end_time)                                         AS last_ran_at,
    EXTRACT(EPOCH FROM (now() - MAX(jrd.end_time))) / 3600.0 AS hours_since_ran,
    CASE
      WHEN j.schedule NOT LIKE '*/5%'
           AND EXTRACT(EPOCH FROM (now() - MAX(jrd.end_time))) / 3600.0 > 26
        THEN true
      ELSE false
    END                                                       AS overdue
  FROM cron.job j
  LEFT JOIN cron.job_run_details jrd ON jrd.jobid = j.jobid
  WHERE j.jobname LIKE 'stage%'
  GROUP BY j.jobname, j.schedule
),

-- Latest ingestion run step counts (for mismatch warning)
ing_steps AS (
  SELECT
    lr.completed_tasks,
    lr.total_tasks,
    ss.steps_err
  FROM latest_runs lr
  LEFT JOIN step_summary ss ON ss.run_id = lr.run_id
  WHERE lr.pipeline_key = 'afl_ingestion'
),

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
    END,
    CASE WHEN (SELECT completed_tasks < total_tasks FROM ing_steps)
      THEN 'INGESTION INCOMPLETE: ' || (SELECT completed_tasks FROM ing_steps) ||
           '/' || (SELECT total_tasks FROM ing_steps) || ' steps completed on last run'
    END,
    CASE WHEN (SELECT COALESCE(steps_err, 0) > 0 FROM ing_steps)
      THEN 'INGESTION ERRORS: ' || (SELECT steps_err FROM ing_steps) || ' step(s) errored on last run'
    END
  ], NULL) AS warning_list
  FROM raw_freshness rf, cache_freshness cf, orphaned_games og
)

SELECT
  now()                                     AS observed_at,

  CASE
    WHEN cardinality(w.warning_list) = 0    THEN 'healthy'
    WHEN cardinality(w.warning_list) >= 3   THEN 'critical'
    ELSE 'warning'
  END                                       AS overall_health,
  w.warning_list,

  rf.total_raw_rows,
  rf.last_raw_updated_at,
  ROUND(rf.raw_hours_stale::numeric, 1)    AS raw_hours_stale,

  pgc.total_games_synced,
  pgc.total_player_game_rows,
  pgc.max_week_synced,

  cf.cached_players,
  cf.cache_last_rebuilt_at,
  ROUND(cf.cache_hours_stale::numeric, 1) AS cache_hours_stale,

  og.orphaned_count                        AS orphaned_ft_games,

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

  lr_nk.run_status                         AS neeko_pipeline_status,
  lr_nk.started_at                         AS neeko_pipeline_started_at,
  lr_nk.completed_tasks                    AS neeko_pipeline_steps_completed,
  lr_nk.total_tasks                        AS neeko_pipeline_steps_total,
  ss_nk.steps_err                          AS neeko_pipeline_steps_err,

  lr_ai.run_status                         AS neeko_ai_status,
  lr_ai.started_at                         AS neeko_ai_started_at,
  lr_ai.completed_tasks                    AS neeko_ai_steps_completed,

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

-- Re-apply grants (view was dropped and recreated)
REVOKE ALL ON public.v_pipeline_observability FROM anon, authenticated;
GRANT SELECT ON public.v_pipeline_observability TO service_role;

-- Re-create RPC (was CASCADE dropped with the view)
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

GRANT EXECUTE ON FUNCTION public.get_pipeline_health() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pipeline_health() FROM anon;
