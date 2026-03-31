
/*
  # Create admin.get_system_health() RPC

  ## Summary
  Builds a single JSON payload summarising the full system health state for the admin
  Health dashboard. Returns one row of aggregated data pulled from multiple schemas.

  ## Sections Returned
  1. **pipeline** — last pipeline run, status, step counts, duration from pipeline_runs/pipeline_steps
  2. **ingestion** — raw games count, player stats count, last ingest timestamp, season coverage
  3. **ai_stats** — rankings cache coverage, projection coverage, AI analysis coverage, queue depths
  4. **data_freshness** — latest round loaded, unique players, last cache refresh, projection freshness
  5. **db_counts** — row counts across key tables
  6. **recent_errors** — last 20 error/warn entries from admin.command_logs (failed commands)

  ## Security
  - Function marked SECURITY DEFINER so it can read across schemas
  - REVOKE from public, GRANT to authenticated only
  - Admin caller check done in edge function layer
*/

CREATE OR REPLACE FUNCTION admin.get_system_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, admin
AS $$
DECLARE
  v_pipeline        jsonb;
  v_ingestion       jsonb;
  v_ai_stats        jsonb;
  v_data_freshness  jsonb;
  v_db_counts       jsonb;
  v_recent_errors   jsonb;
  v_pipeline_steps  jsonb;
BEGIN

  -- -------------------------------------------------------
  -- 1. PIPELINE — most recent pipeline run
  -- -------------------------------------------------------
  SELECT jsonb_build_object(
    'last_run_id',        pr.id,
    'status',             pr.status,
    'label',              pr.label,
    'started_at',         pr.started_at,
    'finished_at',        pr.finished_at,
    'duration_ms',        pr.duration_ms,
    'total_tasks',        pr.total_tasks,
    'completed_tasks',    pr.completed_tasks,
    'current_step',       pr.current_step_label
  )
  INTO v_pipeline
  FROM public.pipeline_runs pr
  ORDER BY pr.started_at DESC NULLS LAST
  LIMIT 1;

  IF v_pipeline IS NULL THEN
    v_pipeline := jsonb_build_object(
      'last_run_id', null, 'status', 'never_run', 'label', null,
      'started_at', null, 'finished_at', null, 'duration_ms', null,
      'total_tasks', 0, 'completed_tasks', 0, 'current_step', null
    );
  END IF;

  -- Recent pipeline steps (last 20)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'step_name',    ps.step_name,
      'step_label',   ps.step_label,
      'status',       ps.status,
      'started_at',   ps.started_at,
      'completed_at', ps.completed_at,
      'duration_ms',  ps.duration_ms,
      'error',        ps.error
    ) ORDER BY ps.started_at DESC
  ), '[]'::jsonb)
  INTO v_pipeline_steps
  FROM (
    SELECT step_name, step_label, status, started_at, completed_at, duration_ms, error
    FROM public.pipeline_steps
    ORDER BY started_at DESC NULLS LAST
    LIMIT 20
  ) ps;

  -- -------------------------------------------------------
  -- 2. INGESTION — raw data counts and freshness
  -- -------------------------------------------------------
  SELECT jsonb_build_object(
    'games_raw_count',        (SELECT count(*) FROM afl.games_raw),
    'games_2026_count',       (SELECT count(*) FROM afl.games_raw WHERE season = 2026),
    'player_stats_count',     (SELECT count(*) FROM afl.raw_player_stats),
    'player_stats_2026',      (SELECT count(*) FROM afl.raw_player_stats WHERE season = 2026),
    'last_stat_week',         (SELECT max(week) FROM afl.raw_player_stats WHERE season = 2026),
    'last_game_date',         (SELECT max(game_date) FROM afl.games_raw WHERE season = 2026),
    'ingest_log_count',       (SELECT count(*) FROM afl.ingest_log),
    'last_ingest_at',         (SELECT max(last_ingested_at) FROM afl.ingest_log),
    'ingest_errors',          (SELECT count(*) FROM afl.ingest_log WHERE status = 'error'),
    'seasons_covered',        (SELECT jsonb_agg(DISTINCT season ORDER BY season) FROM afl.games_raw)
  )
  INTO v_ingestion;

  -- -------------------------------------------------------
  -- 3. AI STATS — coverage, queue, analysis freshness
  -- -------------------------------------------------------
  SELECT jsonb_build_object(
    'rankings_cache_rows',        (SELECT count(*) FROM afl.player_rankings_cache),
    'rankings_with_ai',           (SELECT count(*) FROM afl.player_rankings_cache WHERE ai_summary IS NOT NULL AND ai_summary != ''),
    'rankings_with_reco',         (SELECT count(*) FROM afl.player_rankings_cache WHERE ai_recommendation IS NOT NULL AND ai_recommendation != ''),
    'rankings_cache_refreshed_at',(SELECT max(cached_at) FROM afl.player_rankings_cache),
    'projection_rows',            (SELECT count(*) FROM afl.player_projection),
    'projection_refreshed_at',    (SELECT max(generated_at) FROM afl.player_projection),
    'command_log_rows',           (SELECT count(*) FROM admin.command_logs),
    'commands_last_24h',          (SELECT count(*) FROM admin.command_logs WHERE created_at >= now() - interval '24 hours'),
    'commands_success_24h',       (SELECT count(*) FROM admin.command_logs WHERE created_at >= now() - interval '24 hours' AND status = 'success'),
    'commands_error_24h',         (SELECT count(*) FROM admin.command_logs WHERE created_at >= now() - interval '24 hours' AND status = 'error'),
    'last_command_at',            (SELECT max(created_at) FROM admin.command_logs)
  )
  INTO v_ai_stats;

  -- -------------------------------------------------------
  -- 4. DATA FRESHNESS — canonical player data quality
  -- -------------------------------------------------------
  SELECT jsonb_build_object(
    'unique_players_2026',        (SELECT count(DISTINCT player_id) FROM afl.raw_player_stats WHERE season = 2026),
    'unique_players_all',         (SELECT count(DISTINCT player_id) FROM afl.raw_player_stats),
    'latest_round',               (SELECT max(week) FROM afl.raw_player_stats WHERE season = 2026),
    'total_stat_rows',            (SELECT count(*) FROM afl.raw_player_stats),
    'players_in_roster',          (SELECT count(*) FROM afl.afl_2026_roster),
    'players_with_projection',    (SELECT count(*) FROM afl.player_projection),
    'players_missing_projection', (
      SELECT count(*) FROM afl.afl_2026_roster r
      WHERE NOT EXISTS (SELECT 1 FROM afl.player_projection pp WHERE pp.player_id = r.player_id)
    ),
    'rankings_cache_age_mins',    (
      SELECT EXTRACT(EPOCH FROM (now() - max(cached_at))) / 60
      FROM afl.player_rankings_cache
    ),
    'projection_age_mins',        (
      SELECT EXTRACT(EPOCH FROM (now() - max(generated_at))) / 60
      FROM afl.player_projection
    )
  )
  INTO v_data_freshness;

  -- -------------------------------------------------------
  -- 5. DB COUNTS — quick table row counts
  -- -------------------------------------------------------
  SELECT jsonb_build_object(
    'players',               (SELECT count(*) FROM afl.players),
    'teams',                 (SELECT count(*) FROM afl.teams),
    'games_raw',             (SELECT count(*) FROM afl.games_raw),
    'raw_player_stats',      (SELECT count(*) FROM afl.raw_player_stats),
    'player_projection',     (SELECT count(*) FROM afl.player_projection),
    'player_rankings_cache', (SELECT count(*) FROM afl.player_rankings_cache),
    'pipeline_runs',         (SELECT count(*) FROM public.pipeline_runs),
    'pipeline_steps',        (SELECT count(*) FROM public.pipeline_steps),
    'command_logs',          (SELECT count(*) FROM admin.command_logs),
    'mv_edge_board',         (SELECT count(*) FROM public.mv_edge_board),
    'projection_accuracy',   (SELECT count(*) FROM public.projection_accuracy),
    'start_sit_cache',       (SELECT count(*) FROM public.start_sit_cache),
    'afl_2026_roster',       (SELECT count(*) FROM afl.afl_2026_roster)
  )
  INTO v_db_counts;

  -- -------------------------------------------------------
  -- 6. RECENT ERRORS — last 20 failed commands
  -- -------------------------------------------------------
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',          cl.id,
      'command',     cl.command,
      'status',      cl.status,
      'error',       cl.error,
      'duration_ms', cl.duration_ms,
      'created_at',  cl.created_at
    ) ORDER BY cl.created_at DESC
  ), '[]'::jsonb)
  INTO v_recent_errors
  FROM (
    SELECT id, command, status, error, duration_ms, created_at
    FROM admin.command_logs
    WHERE status = 'error'
    ORDER BY created_at DESC
    LIMIT 20
  ) cl;

  -- -------------------------------------------------------
  -- RETURN COMBINED PAYLOAD
  -- -------------------------------------------------------
  RETURN jsonb_build_object(
    'pipeline',         v_pipeline,
    'pipeline_steps',   v_pipeline_steps,
    'ingestion',        v_ingestion,
    'ai_stats',         v_ai_stats,
    'data_freshness',   v_data_freshness,
    'db_counts',        v_db_counts,
    'recent_errors',    v_recent_errors,
    'generated_at',     now()
  );

END;
$$;

REVOKE ALL ON FUNCTION admin.get_system_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.get_system_health() TO authenticated;
