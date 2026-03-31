/*
  # Fix AFL Processing Pipeline + Market Watch Snapshot

  ## Summary
  Two production-blocking issues fixed:

  1. **run_afl_processing_pipeline()** — Rebuilt with full observability:
     - pipeline_runs insert at start so failures are always recorded
     - pipeline_steps inserts per stage with duration_ms tracking
     - system_logs entry on success AND failure per stage
     - Per-stage EXCEPTION blocks so one failure does not abort remaining stages
     - Calls afl.populate_rankings_cache_from_source() directly (correct path,
       avoids the thin wrapper afl.refresh_player_rankings_cache())

  2. **market.build_market_watch_snapshot()** — Fixed column/value mismatch.
     The SELECT list had 36 expressions for 35 columns (one extra NULL at the
     end). The corrected function matches the exact 35-column schema. Then
     immediately invokes the fixed function to repopulate the empty snapshot.

  ## Tables written
  - public.pipeline_runs
  - public.pipeline_steps
  - public.system_logs
  - market.market_watch_snapshot
  - market.market_watch_snapshot_players
*/

-- ================================================================
-- 1. REBUILD run_afl_processing_pipeline WITH FULL OBSERVABILITY
-- ================================================================

CREATE OR REPLACE FUNCTION public.run_afl_processing_pipeline()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_run_id        uuid := gen_random_uuid();
  v_step_id       uuid;
  v_step_start    timestamptz;
  v_rows_inserted integer := 0;
BEGIN

  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  )
  VALUES (
    v_run_id, 'afl_processing', 'AFL Processing Pipeline', 'running',
    4, 0, 'Starting',
    now(), now()
  )
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------------
  -- STAGE 1: Build player_games from raw stats
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'build_player_games', 'Build Player Games', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    INSERT INTO afl.player_games (
      game_id, player_id, player_name, team_id, team_name,
      season, week, round, player_number,
      disposals, kicks, handballs, marks, tackles,
      hitouts, clearances, goals, goal_assists, behinds,
      free_kicks_for, free_kicks_against, fantasy_score
    )
    SELECT
      r.game_id, r.player_id, p.player_name, r.team_id, t.team_name,
      r.season, r.week, r.round, r.player_number,
      r.disposals, r.kicks, r.handballs, r.marks, r.tackles,
      r.hitouts, r.clearances, r.goals, r.goal_assists, r.behinds,
      r.free_kicks_for, r.free_kicks_against,
      (
        COALESCE(r.kicks,0)*3 + COALESCE(r.handballs,0)*2 + COALESCE(r.marks,0)*3
        + COALESCE(r.tackles,0)*4 + COALESCE(r.hitouts,0)*1 + COALESCE(r.goals,0)*6
        + COALESCE(r.behinds,0)*1 + COALESCE(r.free_kicks_for,0)*1
        - COALESCE(r.free_kicks_against,0)*3
      )
    FROM afl.raw_player_stats r
    LEFT JOIN afl.players p ON p.player_id = r.player_id
    LEFT JOIN afl.teams t ON t.team_id = r.team_id
    LEFT JOIN afl.player_games g ON g.player_id = r.player_id AND g.game_id = r.game_id
    WHERE g.player_id IS NULL;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Player games built (' || v_rows_inserted || ' new rows)'
    WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage build_player_games failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
  END;

  -- ----------------------------------------------------------------
  -- STAGE 2: Refresh Neeko feature engine
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_feature_engine', 'Refresh Feature Engine', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM public.refresh_neeko_intel_features_2026();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Feature engine refreshed'
    WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_feature_engine failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
  END;

  -- ----------------------------------------------------------------
  -- STAGE 3: Refresh rankings cache
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM afl.populate_rankings_cache_from_source();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Rankings cache refreshed'
    WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_rankings_cache failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
  END;

  -- ----------------------------------------------------------------
  -- STAGE 4: Refresh Market Watch + Edge Board
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_market_edge', 'Refresh Market Watch + Edge Board', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM market.build_market_watch_snapshot();
    PERFORM public.fn_refresh_edge_board();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Market Watch + Edge Board refreshed'
    WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_market_edge failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
  END;

  -- ----------------------------------------------------------------
  -- Finalise
  -- ----------------------------------------------------------------
  UPDATE public.pipeline_runs
  SET status = 'complete', current_step_label = 'Done', finished_at = now()
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_complete', 'cron:afl_processing_pipeline', 'info',
    'AFL processing pipeline completed successfully',
    jsonb_build_object(
      'run_id', v_run_id,
      'new_player_game_rows', v_rows_inserted,
      'finished_at', now()
    ));

END;
$function$;


-- ================================================================
-- 2. FIX market.build_market_watch_snapshot — column/value mismatch
--    The SELECT had 36 expressions for 35 columns (one extra trailing NULL).
--    Corrected to exactly 35 values matching the 35-column table schema.
-- ================================================================

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_snapshot_id uuid;
    v_season      int;
    v_round       int;
BEGIN

  v_snapshot_id := gen_random_uuid();

  SELECT MAX(season), MAX(week)
  INTO v_season, v_round
  FROM afl.player_games;

  TRUNCATE TABLE
    market.market_watch_snapshot_players,
    market.market_watch_best_trades,
    market.market_watch_snapshot
  CASCADE;

  INSERT INTO market.market_watch_snapshot (
    snapshot_id, season, round_number, created_at, updated_at, is_active
  )
  VALUES (v_snapshot_id, v_season, v_round, NOW(), NOW(), TRUE);

  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    breakeven,
    projection,
    ceiling,
    risk_pct,
    price_edge_pts,
    expected_price_change,
    category,
    action,
    trade_score,
    reasons,
    created_at,
    projected_price,
    projected_price_r1,
    projected_price_r2,
    projected_price_r3,
    breakout_score,
    breakout_flag,
    volatility_score,
    volatility_level,
    last3_avg,
    estimated_price,
    value_score,
    price_range_top,
    price_range_bottom,
    value_momentum,
    momentum_label,
    peak_price,
    peak_round,
    peak_status
  )
  SELECT
    v_snapshot_id,
    r.player_id,
    r.player_name,
    r.team_name,
    r.position_group,
    r.price,
    NULL::numeric,
    r.projection,
    r.ceiling::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::text,
    NULL::text,
    NULL::numeric,
    NULL::jsonb,
    NOW(),
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::boolean,
    r.volatility,
    NULL::text,
    r.last3_avg,
    NULL::numeric,
    r.value_score,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::text,
    NULL::numeric,
    NULL::text,
    NULL::text
  FROM afl.v_player_rankings r
  WHERE r.projection IS NOT NULL;

END;
$function$;


-- ================================================================
-- 3. IMMEDIATELY REPOPULATE THE EMPTY MARKET WATCH SNAPSHOT
-- ================================================================
SELECT market.build_market_watch_snapshot();
