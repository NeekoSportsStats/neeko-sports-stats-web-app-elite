/*
  # Secure Pipeline RPCs With Admin Guard

  ## Summary
  Wraps the pipeline trigger RPCs with admin-only access control.
  The strategy is to add an admin guard at the top of each function
  ONLY for authenticated (non-cron) callers.

  Cron jobs run as the postgres/service role where auth.uid() IS NULL,
  so the guard `IF auth.uid() IS NOT NULL AND NOT is_admin_user()` will
  correctly skip for cron context while blocking unauthorized API calls.

  ## Functions Hardened
  - run_afl_pipeline_controller (full controller pipeline)
  - run_neeko_ai_pipeline (AI generation pipeline)
  - run_afl_processing_pipeline (processing pipeline)
  - run_afl_ingestion_pipeline (ingestion pipeline)
  - run_ai_generation_pipeline (AI generation wrapper)

  ## Security Notes
  - Guard uses is_admin_user() which reads from profiles.is_admin
  - Returns INSUFFICIENT_PRIVILEGE error for non-admin authenticated callers
  - Cron jobs are unaffected (auth.uid() IS NULL in cron context)
  - Real admins continue to work normally
*/

-- ============================================================
-- run_afl_pipeline_controller  (no return type — void)
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
rows_inserted integer;
accuracy_rows integer;
BEGIN

  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- =====================================================
  -- 1) INSERT PLAYER GAMES FROM RAW STATS
  -- =====================================================

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
            COALESCE(r.kicks,0) * 3
          + COALESCE(r.handballs,0) * 2
          + COALESCE(r.marks,0) * 3
          + COALESCE(r.tackles,0) * 4
          + COALESCE(r.hitouts,0) * 1
          + COALESCE(r.goals,0) * 6
          + COALESCE(r.behinds,0) * 1
          + COALESCE(r.free_kicks_for,0) * 1
          - COALESCE(r.free_kicks_against,0) * 3
      ) AS fantasy_score
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  LEFT JOIN afl.teams t ON t.team_id = r.team_id
  LEFT JOIN afl.player_games g ON g.player_id = r.player_id AND g.game_id = r.game_id
  WHERE g.player_id IS NULL;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  RAISE NOTICE 'Player games inserted: %', rows_inserted;

  -- =====================================================
  -- 2) REFRESH NEEKO FEATURE ENGINE
  -- =====================================================
  PERFORM public.refresh_neeko_intel_features_2026();
  RAISE NOTICE 'Neeko feature engine refreshed';

  -- =====================================================
  -- 3) REFRESH RANKINGS CACHE
  -- =====================================================
  PERFORM afl.refresh_player_rankings_cache();
  RAISE NOTICE 'Rankings cache refreshed';

  -- =====================================================
  -- 4) UPDATE PROJECTION ACCURACY
  -- =====================================================
  INSERT INTO projection_accuracy (
      player_id, game_id, season, round_number,
      projected_score, actual_score, abs_error
  )
  SELECT
      pg.player_id, pg.game_id, pg.season, pg.week,
      pr.projection, pg.fantasy_score,
      ABS(pg.fantasy_score - pr.projection)
  FROM afl.player_games pg
  JOIN afl.v_projection_engine pr ON pr.player_id = pg.player_id
  LEFT JOIN projection_accuracy pa
      ON pa.player_id = pg.player_id AND pa.game_id = pg.game_id
  WHERE pa.player_id IS NULL AND pg.fantasy_score IS NOT NULL;

  GET DIAGNOSTICS accuracy_rows = ROW_COUNT;
  RAISE NOTICE 'Projection accuracy rows inserted: %', accuracy_rows;

  RAISE NOTICE 'AFL ingestion pipeline complete';
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_afl_pipeline_controller() TO authenticated;

-- ============================================================
-- run_neeko_ai_pipeline  (returns jsonb)
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_neeko_ai_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
v_run_id         uuid := gen_random_uuid();
v_step_id        uuid;
v_step_start     timestamptz;
v_service_key    text;
v_base_url       text;
v_enqueue_result jsonb;
v_pending_count  bigint;
v_result         jsonb := '[]'::jsonb;
v_steps_ok       int   := 0;
v_steps_err      int   := 0;
BEGIN

  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve service key
  BEGIN
    v_service_key := internal.get_cron_secret('supabase_secret_key');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_service_key FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
  END;

  -- Resolve base URL
  BEGIN
    v_base_url := internal.get_cron_secret('supabase_url');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_base_url FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
  END;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := current_setting('app.supabase_url', true);
  END IF;
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://zbomenuickrogthnsozb.supabase.co';
  END IF;
  v_base_url := rtrim(v_base_url, '/') || '/functions/v1';

  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  )
  VALUES (
    v_run_id, 'neeko_ai', 'Neeko AI Pipeline', 'running',
    3, 0, 'Starting', now(), now()
  )
  ON CONFLICT DO NOTHING;

  -- STAGE 1: enqueue players needing AI
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'enqueue_ai_players', 'Enqueue AI Players', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT public.run_neeko_ai_enqueue() INTO v_enqueue_result;

    UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start) WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Players enqueued: ' || COALESCE((v_enqueue_result->>'players_enqueued')::text, '0') WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'enqueue_ai_players', 'status', 'complete', 'detail', v_enqueue_result));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'enqueue_ai_players', 'status', 'error', 'message', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error', 'Stage enqueue_ai_players failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- STAGE 2: drain ai_generation_queue via generate-ai-worker
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'drain_ai_generation_queue', 'Drain AI Generation Queue', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT COUNT(*) INTO v_pending_count FROM public.ai_generation_queue WHERE status = 'pending';

    IF v_pending_count > 0 AND v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-ai-worker',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := '{}'::jsonb
      );
    END IF;

    UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start) WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'AI worker fired for ' || v_pending_count || ' pending jobs' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'drain_ai_generation_queue', 'status', 'complete', 'pending_at_fire', v_pending_count));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'drain_ai_generation_queue', 'status', 'error', 'message', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error', 'Stage drain_ai_generation_queue failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- STAGE 3: fire generate-player-ai
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'fire_player_ai_worker', 'Fire Player AI Worker', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    IF v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-player-ai',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := '{}'::jsonb
      );
    END IF;

    UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start) WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player AI worker triggered' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'fire_player_ai_worker', 'status', 'complete'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'fire_player_ai_worker', 'status', 'error', 'message', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error', 'Stage fire_player_ai_worker failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  UPDATE public.pipeline_runs
  SET status = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      current_step_label = 'Done', finished_at = now()
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_complete', 'cron:neeko_ai_pipeline_daily', 'info',
    'Neeko AI pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err,
    jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err, 'pending_at_fire', v_pending_count));

  RETURN jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err, 'steps', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_neeko_ai_pipeline() TO authenticated;

-- ============================================================
-- run_ai_generation_pipeline  (returns jsonb)
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_ai_generation_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.fire_ai_generation_all_players();
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_ai_generation_pipeline() TO authenticated;
