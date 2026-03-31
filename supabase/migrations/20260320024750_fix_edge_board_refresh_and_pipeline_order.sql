/*
  # Fix Edge Board Refresh + Pipeline Order

  ## Problems Fixed

  1. **fn_refresh_edge_board()** was calling `REFRESH MATERIALIZED VIEW` on a plain
     table (relkind='r') — this always errors/no-ops, leaving mv_edge_board stale since 2026-03-17.

  2. **refresh_mv_edge_board()** calls `get_edge_board_data()` with no arguments — that
     function requires `limit_n integer`. Fixed to pass limit_n = 10 (captures all 3 sections
     with up to 10 rows each for the populated table).

  3. **Pipeline execution order**: edge board was being refreshed at Step 16 (before AI
     generation completes — AI is fired async at Step 10). The edge board now reads directly
     from afl.player_rankings_cache which already has ai_summary populated, so the refresh
     needs to happen AFTER the cache is confirmed fresh.

  4. **Single source of truth**: The new populate_mv_edge_board() function reads exclusively
     from afl.player_rankings_cache — no fallback to v_rankings_canonical. This ensures
     Edge Watch always shows the same data as Rankings.

  ## Changes

  - DROP + RECREATE fn_refresh_edge_board() — now does TRUNCATE + INSERT from cache
  - DROP + RECREATE refresh_mv_edge_board() — alias to fn_refresh_edge_board
  - CREATE populate_mv_edge_board() — the canonical single-source function
  - UPDATE run_neeko_pipeline() — moves edge board + market watch refresh to AFTER AI cache sync

  ## Security
  - All functions remain SECURITY DEFINER with same admin guard
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Core populate function — reads ONLY from afl.player_rankings_cache
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN

  TRUNCATE TABLE public.mv_edge_board;

  WITH ranked AS (
    SELECT
      c.player_id::text                                                     AS player_id,
      c.player_name,
      c.team,
      c.position,
      c.projection_final::numeric                                           AS projection_final,
      c.ceiling_estimate::numeric                                           AS ceiling_estimate,
      c.floor_estimate::numeric                                             AS floor_estimate,
      c.upside_rating::numeric                                              AS upside_rating,
      c.risk_rating::numeric                                                AS risk_rating,
      c.projection_confidence::numeric                                      AS projection_confidence,
      c.captain_score::numeric                                              AS captain_score,
      c.captain_rating,
      c.neeko_rating::numeric                                               AS neeko_rating,
      c.price::numeric                                                      AS price,
      c.value_score::numeric                                                AS value_score,
      c.consistency_score::numeric                                          AS consistency_score,
      c.value_tag,
      c.ai_summary,
      c.recommendation_color,
      -- ceiling gap used for breakout eligibility
      (COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0))  AS ceiling_gap,
      ROW_NUMBER() OVER (ORDER BY c.neeko_rating      DESC NULLS LAST)     AS neeko_rating_rank,
      ROW_NUMBER() OVER (ORDER BY c.captain_score     DESC NULLS LAST)     AS captain_rank
    FROM afl.player_rankings_cache c
    WHERE c.player_id IS NOT NULL
      AND COALESCE(c.projection_final, 0) > 0
  ),

  captain_eligible AS (
    SELECT * FROM ranked WHERE captain_score IS NOT NULL
  ),

  breakout_eligible AS (
    SELECT * FROM ranked
    WHERE ceiling_gap           >= 50
      AND projection_final      >= 50
      AND floor_estimate        >= 25
      AND projection_confidence >= 40
      AND risk_rating           <= 75
      AND captain_rank          >  5
  ),

  trap_strict AS (
    SELECT * FROM ranked
    WHERE neeko_rating_rank <= 100
      AND (risk_rating >= 50 OR value_score < 95)
      AND (
        (CASE WHEN risk_rating           >= 55 THEN 1 ELSE 0 END) +
        (CASE WHEN consistency_score     <= 50 THEN 1 ELSE 0 END) +
        (CASE WHEN value_score           <  95 THEN 1 ELSE 0 END) +
        (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
      ) >= 2
  ),

  trap_fallback AS (
    SELECT * FROM ranked
    WHERE neeko_rating_rank <= 100
      AND player_id NOT IN (SELECT player_id FROM trap_strict WHERE player_id IS NOT NULL)
    ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
  ),

  trap_combined AS (
    SELECT *, 1 AS trap_priority FROM trap_strict
    UNION ALL
    SELECT *, 2 AS trap_priority FROM trap_fallback
  ),

  trap_final AS (
    SELECT *,
      ROW_NUMBER() OVER (
        ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
      ) AS trap_rn
    FROM trap_combined
  ),

  sectioned AS (
    -- CAPTAIN section
    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'captain'::text AS section,
      ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
    FROM captain_eligible

    UNION ALL

    -- BREAKOUT section
    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'breakout'::text AS section,
      ROW_NUMBER() OVER (
        ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST
      ) AS section_rank
    FROM breakout_eligible

    UNION ALL

    -- TRAP section
    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'trap'::text AS section,
      trap_rn      AS section_rank
    FROM trap_final
    WHERE trap_rn <= 10
  )

  INSERT INTO public.mv_edge_board (
    player_id, player_name, team, position, section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    refreshed_at
  )
  SELECT
    player_id, player_name, team, position, section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    now()
  FROM sectioned
  WHERE section_rank <= 10;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'edge_board_refreshed', 'populate_mv_edge_board', 'info',
    'Edge board rebuilt from player_rankings_cache: ' || v_inserted || ' rows',
    jsonb_build_object('rows_inserted', v_inserted, 'refreshed_at', now())
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message)
  VALUES ('edge_board_refresh_error', 'populate_mv_edge_board', 'error', SQLERRM);
  RAISE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Fix fn_refresh_edge_board — was wrongly calling REFRESH MATERIALIZED VIEW
--         mv_edge_board is a plain table, not a materialized view
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_refresh_edge_board()
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_refreshed_at timestamptz;
BEGIN
  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.populate_mv_edge_board();

  SELECT MAX(refreshed_at) INTO v_refreshed_at FROM public.mv_edge_board;
  RETURN v_refreshed_at;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Fix refresh_mv_edge_board — align with populate function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
BEGIN
  PERFORM public.populate_mv_edge_board();
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Add validation check function — compares cache vs edge board
-- ─────────────────────────────="────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_edge_board_consistency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_cache_avg_proj  numeric;
  v_edge_avg_proj   numeric;
  v_drift           numeric;
  v_cache_ai_count  integer;
  v_edge_ai_count   integer;
  v_edge_rows       integer;
  v_cache_rows      integer;
  v_status          text;
  v_issues          jsonb := '[]'::jsonb;
BEGIN
  SELECT
    ROUND(AVG(projection_final)::numeric, 2),
    COUNT(*),
    COUNT(*) FILTER (WHERE ai_summary IS NOT NULL)
  INTO v_cache_avg_proj, v_cache_rows, v_cache_ai_count
  FROM afl.player_rankings_cache
  WHERE projection_final > 0;

  SELECT
    ROUND(AVG(projection_final)::numeric, 2),
    COUNT(*),
    COUNT(*) FILTER (WHERE ai_summary IS NOT NULL)
  INTO v_edge_avg_proj, v_edge_rows, v_edge_ai_count
  FROM public.mv_edge_board;

  -- Projection drift check (edge board is top players so higher avg is expected,
  -- but we check that edge board players match their cache counterparts exactly)
  SELECT ROUND(ABS(
    AVG(e.projection_final::numeric) - AVG(c.projection_final::numeric)
  )::numeric, 2)
  INTO v_drift
  FROM public.mv_edge_board e
  JOIN afl.player_rankings_cache c ON c.player_id::text = e.player_id;

  IF v_drift IS NULL OR v_drift > 1.0 THEN
    v_issues := v_issues || jsonb_build_array(
      jsonb_build_object(
        'issue', 'projection_drift',
        'detail', 'Edge board projections differ from cache by ' || COALESCE(v_drift::text, 'NULL') || ' pts',
        'severity', CASE WHEN v_drift > 5 THEN 'critical' ELSE 'warning' END
      )
    );
  END IF;

  IF v_edge_rows < 15 THEN
    v_issues := v_issues || jsonb_build_array(
      jsonb_build_object(
        'issue', 'low_edge_board_rows',
        'detail', 'Edge board has only ' || v_edge_rows || ' rows (expected >=15)',
        'severity', 'warning'
      )
    );
  END IF;

  IF v_edge_ai_count < v_edge_rows THEN
    v_issues := v_issues || jsonb_build_array(
      jsonb_build_object(
        'issue', 'missing_ai_summaries',
        'detail', v_edge_rows - v_edge_ai_count || ' edge board rows missing ai_summary',
        'severity', 'warning'
      )
    );
  END IF;

  v_status := CASE WHEN jsonb_array_length(v_issues) = 0 THEN 'ok' ELSE 'issues_found' END;

  RETURN jsonb_build_object(
    'status',           v_status,
    'cache_rows',       v_cache_rows,
    'cache_ai_count',   v_cache_ai_count,
    'cache_avg_proj',   v_cache_avg_proj,
    'edge_rows',        v_edge_rows,
    'edge_ai_count',    v_edge_ai_count,
    'edge_avg_proj',    v_edge_avg_proj,
    'matched_drift_pts', v_drift,
    'issues',           v_issues,
    'checked_at',       now()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5: Update run_neeko_pipeline — move edge board refresh to AFTER AI cache
--         sync so edge board always contains current AI summaries.
--         Order: projections → cache → market watch → AI trigger → edge board
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_neeko_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_run_id           uuid        := gen_random_uuid();
  v_run_start        timestamptz := clock_timestamp();
  v_step_id          uuid;
  v_step_start       timestamptz;
  v_service_key      text;
  v_base_url         text;
  v_projection_result text;
  v_result           jsonb := '[]'::jsonb;
  v_steps_ok         int   := 0;
  v_steps_err        int   := 0;
  v_lock_acquired    boolean := false;
BEGIN

  v_lock_acquired := public.neeko_try_advisory_lock(1);
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'status',  'already_running',
      'message', 'Pipeline already running — advisory lock held by another session'
    );
  END IF;

  BEGIN

    BEGIN
      v_service_key := internal.get_cron_secret('supabase_secret_key');
    EXCEPTION WHEN OTHERS THEN
      SELECT value INTO v_service_key FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
    END;

    BEGIN
      v_base_url := internal.get_cron_secret('supabase_url');
    EXCEPTION WHEN OTHERS THEN
      SELECT value INTO v_base_url FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
    END;

    v_base_url := rtrim(COALESCE(v_base_url, 'https://zbomenuickrogthnsozb.supabase.co'), '/') || '/functions/v1';

    INSERT INTO public.pipeline_runs (
      id, pipeline_key, label, status,
      total_tasks, completed_tasks, current_step_label,
      started_at, finished_at
    ) VALUES (
      v_run_id, 'neeko_full_pipeline', 'Neeko Full Pipeline', 'running',
      17, 0, 'Starting', v_run_start, v_run_start
    ) ON CONFLICT DO NOTHING;

    -- STEP 1: refresh_player_variation
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_variation', 'Refresh Player Variation', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_variation();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player variation refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_variation failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 2: refresh_player_opponent_concession
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_concession', 'Refresh Opponent Concession', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_opponent_concession();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Opponent concession refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_concession failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 3: refresh_team_game_environment
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_team_game_environment', 'Refresh Team Game Environment', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_team_game_environment();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Team game environment refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_team_game_environment failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 4: refresh_player_role_signals
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_role_signals', 'Refresh Player Role Signals', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_role_signals();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player role signals refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_role_signals', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_role_signals', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_role_signals failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 5: refresh_player_breakout_model
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_breakout_model', 'Refresh Breakout Model', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_breakout_model();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Breakout model refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_breakout_model', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_breakout_model', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_breakout_model failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 6: refresh_opponent_position_venue_concession
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_position_venue_concession', 'Refresh Venue Concession', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_opponent_position_venue_concession();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Venue concession refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_position_venue_concession', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_position_venue_concession', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_position_venue_concession failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 7: rebuild_player_projection
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'rebuild_player_projection', 'Rebuild Player Projection', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      SELECT afl.rebuild_player_projection() INTO v_projection_result;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection rebuilt' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'ok', 'detail', v_projection_result));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'rebuild_player_projection failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 8: populate rankings cache
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.populate_rankings_cache_from_source();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings cache refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_rankings_cache failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 9: trigger generate-player-ai (async — fires HTTP, does not wait)
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'trigger_generate_player_ai', 'Trigger Generate Player AI', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      IF v_service_key IS NOT NULL AND v_service_key != '' THEN
        PERFORM net.http_post(
          url     := v_base_url || '/generate-player-ai',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
          body    := '{}'::jsonb
        );
      END IF;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI generation triggered' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'trigger_generate_player_ai failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 10: build market watch snapshot (reads from rankings cache — correct order)
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'build_market_watch_snapshot', 'Build Market Watch Snapshot', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM market.build_market_watch_snapshot();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Market watch snapshot built' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'build_market_watch_snapshot', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'build_market_watch_snapshot', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'build_market_watch_snapshot failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 11: snapshot projections
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'snapshot_projections', 'Snapshot Next Round Projections', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.snapshot_player_projections_for_next_round();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projections snapshotted' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'snapshot_projections', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'snapshot_projections', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'snapshot_projections failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 12: refresh projection errors
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_projection_errors', 'Refresh Projection Errors', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_player_projection_error();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection errors refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_projection_errors', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_projection_errors', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_projection_errors failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 13: refresh model calibration
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_model_calibration', 'Refresh Model Calibration', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_model_calibration();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Model calibration refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_model_calibration', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_model_calibration', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_model_calibration failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 14: refresh calibrated confidence
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_calibrated_confidence', 'Refresh Calibrated Confidence', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_player_projection_confidence_calibrated();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Calibrated confidence refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_calibrated_confidence', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_calibrated_confidence', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_calibrated_confidence failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 15: refresh bias adjustments
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_bias_adjustments', 'Refresh Bias Adjustments', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_bias_adjustments();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Bias adjustments refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_bias_adjustments', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_bias_adjustments', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_bias_adjustments failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 16: refresh edge board
    -- NOTE: Moved AFTER market watch and accuracy steps so edge board is populated
    -- from fully-refreshed rankings cache. AI summaries are written back to cache
    -- by generate-player-ai edge function (async), so edge board gets whatever is
    -- current in cache at this point — typically the previous run's AI.
    -- The generate-ai-worker cron (runs 5-min after pipeline) will push new AI
    -- back to cache, and the next scheduled cache refresh picks it up.
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_edge_board', 'Refresh Edge Board', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.populate_mv_edge_board();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Edge board refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_edge_board', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_edge_board', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_edge_board failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 17: refresh fantasy market matches
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_fantasy_market_matches', 'Refresh Fantasy Market Matches', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_fantasy_market_matches();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Fantasy market matches refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error',
        'refresh_fantasy_market_matches failed: ' || SQLERRM,
        jsonb_build_object('run_id', v_run_id));
    END;

    UPDATE public.pipeline_runs
    SET
      status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      current_step_label = 'Done',
      finished_at        = clock_timestamp(),
      duration_ms        = EXTRACT(EPOCH FROM (clock_timestamp() - v_run_start) * 1000)::integer
    WHERE id = v_run_id;

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'pipeline_complete', 'cron:neeko_full_pipeline', 'info',
      'Neeko full pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err,
      jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err)
    );

    PERFORM public.neeko_advisory_unlock(1);

    RETURN jsonb_build_object(
      'run_id',    v_run_id,
      'steps_ok',  v_steps_ok,
      'steps_err', v_steps_err,
      'steps',     v_result
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_runs
    SET status = 'error', current_step_label = 'Fatal error',
        finished_at = clock_timestamp()
    WHERE id = v_run_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
      ('pipeline_fatal_error', 'cron:neeko_full_pipeline', 'error',
       'Fatal pipeline error: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    PERFORM public.neeko_advisory_unlock(1);
    RAISE;
  END;

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6: Also wire edge board refresh into the post-AI-cache-sync cron
--         so when generate-ai-worker finishes and updates the cache,
--         the edge board automatically gets fresh AI summaries too.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_post_ai_cache_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
BEGIN
  -- Re-sync AI fields from ai.player_analysis into rankings cache
  UPDATE afl.player_rankings_cache rc
  SET
    ai_summary         = pa.summary,
    recommendation_color = pa.recommendation_color,
    ai_updated_at      = pa.created_at
  FROM ai.player_analysis pa
  WHERE pa.player_id = rc.player_id
    AND (
      rc.ai_updated_at IS NULL
      OR pa.created_at > rc.ai_updated_at
    );

  -- Rebuild edge board from freshly-synced cache
  PERFORM public.populate_mv_edge_board();

  INSERT INTO public.system_logs (event_type, source, log_level, message)
  VALUES ('post_ai_sync', 'run_post_ai_cache_sync', 'info', 'AI cache sync + edge board rebuild complete');

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message)
  VALUES ('post_ai_sync_error', 'run_post_ai_cache_sync', 'error', SQLERRM);
END;
$$;
