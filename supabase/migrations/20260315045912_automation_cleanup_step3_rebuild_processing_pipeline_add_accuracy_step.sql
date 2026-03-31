/*
  # Automation Cleanup — Step 3: Rebuild Processing Pipeline with Accuracy Step

  ## Summary
  Rebuilds `run_afl_processing_pipeline` to include a 5th stage:
  refresh_projection_accuracy. This replaces the now-removed
  `refresh-projection-accuracy` cron job (which ran every 30 minutes).

  ## Execution Order (unchanged)
  1. build_player_games        — insert new player game rows from raw stats
  2. refresh_feature_engine    — refresh Neeko intel features table
  3. refresh_rankings_cache    — populate afl.player_rankings_cache
  4. refresh_market_edge       — build market watch snapshot + refresh edge board
  5. refresh_projection_accuracy — seed projections + fill actuals for completed games

  ## Notes
  - Projection formulas and ranking algorithms are NOT modified
  - total_tasks updated from 4 to 5
  - pipeline_runs finished_at is now properly set AFTER all stages complete
*/

CREATE OR REPLACE FUNCTION public.run_afl_processing_pipeline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  ) VALUES (
    v_run_id, 'afl_processing', 'AFL Processing Pipeline', 'running',
    5, 0, 'Starting', now(), now()
  ) ON CONFLICT DO NOTHING;

  -- STAGE 1: Build player_games from raw stats
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
        COALESCE(r.kicks, 0) * 3 + COALESCE(r.handballs, 0) * 2 +
        COALESCE(r.marks, 0) * 3 + COALESCE(r.tackles, 0) * 4 +
        COALESCE(r.hitouts, 0) * 1 + COALESCE(r.goals, 0) * 6 +
        COALESCE(r.behinds, 0) * 1 + COALESCE(r.free_kicks_for, 0) * 1 -
        COALESCE(r.free_kicks_against, 0) * 3
      )
    FROM afl.raw_player_stats r
    LEFT JOIN afl.players p ON p.player_id = r.player_id
    LEFT JOIN afl.teams   t ON t.team_id   = r.team_id
    LEFT JOIN afl.player_games g ON g.player_id = r.player_id AND g.game_id = r.game_id
    WHERE g.player_id IS NULL;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Player games built (' || v_rows_inserted || ' new rows)'
    WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage build_player_games failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- STAGE 2: Refresh Neeko feature engine
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_feature_engine', 'Refresh Feature Engine', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM public.refresh_neeko_intel_features_2026();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1, current_step_label = 'Feature engine refreshed'
    WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_feature_engine failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- STAGE 3: Refresh rankings cache
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM afl.populate_rankings_cache_from_source();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings cache refreshed'
    WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_rankings_cache failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- STAGE 4: Refresh Market Watch + Edge Board
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_market_edge', 'Refresh Market Watch + Edge Board', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM market.build_market_watch_snapshot();
    PERFORM public.fn_refresh_edge_board();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1, current_step_label = 'Market Watch + Edge Board refreshed'
    WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_market_edge failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- STAGE 5: Refresh projection accuracy
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_projection_accuracy', 'Refresh Projection Accuracy', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM public.refresh_projection_accuracy();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection accuracy refreshed'
    WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_processing_pipeline', 'error',
      'Stage refresh_projection_accuracy failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

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
    )
  );

END;
$$;
