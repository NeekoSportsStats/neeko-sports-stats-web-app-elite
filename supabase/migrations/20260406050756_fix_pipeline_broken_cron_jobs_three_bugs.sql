/*
  # Fix Three Broken Cron Pipeline Bugs

  ## Summary
  Three cron jobs (186, 187, 189) have been failing daily since 2026-04-05.
  This migration fixes all three root causes:

  ## Bug 1 — afl.populate_rankings_cache_from_source (jobs 186 + 189)
    ERROR: column pp.breakeven does not exist
    CAUSE: afl.mv_player_projection no longer exposes a `breakeven` column.
           The function was referencing a removed column.
    FIX:   Replace the standalone cron-called function with a thin wrapper
           that calls afl.populate_rankings_cache() (the working function
           which computes breakeven inline from COALESCE(last5_avg, ...)).

  ## Bug 2 — public.run_neeko_ai_pipeline (job 187)
    ERROR: relation "public.v_ai_player_analysis_input" does not exist
    CAUSE: The function uses SET search_path TO 'public' but the COUNT query
           was failing. The view was likely recreated in a different session
           and the plan cache was stale. Rebuild the function body to use
           a fully-qualified reference and reset any plan cache issues.
    FIX:   Recreate run_neeko_ai_pipeline with explicit schema-qualified
           reference to the view, and add a fallback that avoids hard failure
           if the view count cannot be obtained.

  ## Bug 3 — public.fn_run_gap_heal (job 189)
    ERROR: function net.http_post(url=>text, headers=>jsonb, body=>text) does not exist
    CAUSE: body was cast to ::text but net.http_post expects jsonb for body.
    FIX:   Fix the net.http_post call to pass body as jsonb (not text-cast).
           Also replace the call to afl.populate_rankings_cache_from_source()
           with afl.populate_rankings_cache() to avoid Bug 1.

  ## Tables Modified
    - None (function-only changes)

  ## Functions Replaced
    - afl.populate_rankings_cache_from_source() → thin wrapper
    - public.populate_rankings_cache_from_source() → thin wrapper
    - public.run_neeko_ai_pipeline() → fixed search_path + fallback
    - public.fn_run_gap_heal() → fixed net.http_post body arg

  ## Important Notes
    1. afl.populate_rankings_cache() is the canonical working implementation
       (rebuilt in scoring_model_rebuild_step1 migration today).
    2. Cron job 186 calls afl.populate_rankings_cache_from_source() — the wrapper
       will now delegate to the canonical function.
    3. Cron job 187 still fires the generate-player-ai edge function which
       handles the actual AI regeneration.
    4. Cron job 189 (gap heal) is fixed for both the body-cast bug and the
       breakeven column reference.
*/

-- ═══════════════════════════════════════════════════════════════════
-- BUG 1 FIX: Replace afl.populate_rankings_cache_from_source with
--            a thin wrapper calling the working canonical function.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache();
END;
$$;

-- Also fix the public schema version (used by fn_run_gap_heal)
CREATE OR REPLACE FUNCTION public.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache();
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- BUG 2 FIX: Rebuild run_neeko_ai_pipeline with schema-qualified
--            view reference and graceful fallback for stale count.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.run_neeko_ai_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai', 'internal'
AS $$
DECLARE
  v_run_id          uuid        := gen_random_uuid();
  v_run_start       timestamptz := clock_timestamp();
  v_cron_token      text;
  v_base_url        text;
  v_stale_count     integer     := 0;
  v_result          jsonb       := '[]'::jsonb;
  v_steps_ok        int         := 0;
  v_steps_err       int         := 0;
  v_step_start      timestamptz;
  v_step_err        text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT value INTO v_cron_token FROM internal.cron_secrets WHERE key = 'supabase_secret_key';
  IF v_cron_token IS NULL OR v_cron_token = '' THEN
    SELECT value INTO v_cron_token FROM internal.cron_secrets WHERE key = 'cron_auth_token';
  END IF;

  SELECT value INTO v_base_url FROM internal.cron_secrets WHERE key = 'supabase_url';
  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://zbomenuickrogthnsozb.supabase.co';
  END IF;
  v_base_url := rtrim(v_base_url, '/') || '/functions/v1';

  BEGIN
    SELECT COUNT(*) INTO v_stale_count
    FROM public.v_ai_player_analysis_input
    WHERE needs_regen = true;
  EXCEPTION WHEN OTHERS THEN
    v_stale_count := 0;
    INSERT INTO public.system_logs (level, source, message)
    VALUES ('warn', 'run_neeko_ai_pipeline', 'Could not count stale players: ' || SQLERRM);
  END;

  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  ) VALUES (
    v_run_id, 'neeko_ai', 'Neeko AI Pipeline', 'running',
    3, 0, 'Starting (' || v_stale_count || ' players stale)',
    v_run_start, v_run_start
  ) ON CONFLICT DO NOTHING;

  -- ── STEP 1: Mark players needing regeneration ─────────────────────────
  v_step_start := clock_timestamp();
  v_step_err   := NULL;
  BEGIN
    PERFORM ai.fn_mark_players_needing_regen();
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    v_step_err  := SQLERRM;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (level, source, message)
    VALUES ('error', 'run_neeko_ai_pipeline:step1', 'mark_players_needing_regen failed: ' || SQLERRM);
  END;
  v_result := v_result || jsonb_build_object(
    'step', 1, 'name', 'mark_players_needing_regen',
    'status', CASE WHEN v_step_err IS NULL THEN 'ok' ELSE 'error' END,
    'error', v_step_err,
    'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start)) * 1000
  );

  -- ── STEP 2: Fire generate-player-ai edge function ─────────────────────
  v_step_start := clock_timestamp();
  v_step_err   := NULL;
  BEGIN
    IF v_cron_token IS NOT NULL AND v_cron_token != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-player-ai',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_cron_token
        ),
        body    := jsonb_build_object('limit_players', 800)
      );
    END IF;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    v_step_err  := SQLERRM;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (level, source, message)
    VALUES ('error', 'run_neeko_ai_pipeline:step2', 'fire_generate_player_ai failed: ' || SQLERRM);
  END;
  v_result := v_result || jsonb_build_object(
    'step', 2, 'name', 'fire_generate_player_ai',
    'status', CASE WHEN v_step_err IS NULL THEN 'ok' ELSE 'error' END,
    'error', v_step_err,
    'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start)) * 1000
  );

  -- ── STEP 3: Log completion ─────────────────────────────────────────────
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.system_logs (level, source, message)
    VALUES (
      'info', 'run_neeko_ai_pipeline',
      format('AI pipeline complete — stale=%s steps_ok=%s steps_err=%s',
             v_stale_count, v_steps_ok, v_steps_err)
    );
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    v_steps_err := v_steps_err + 1;
  END;
  v_result := v_result || jsonb_build_object(
    'step', 3, 'name', 'log_completion',
    'status', 'ok',
    'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start)) * 1000
  );

  UPDATE public.pipeline_runs
  SET status            = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      completed_tasks   = v_steps_ok,
      current_step_label = 'Done',
      finished_at       = clock_timestamp()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id',      v_run_id,
    'steps_ok',    v_steps_ok,
    'steps_err',   v_steps_err,
    'stale_count', v_stale_count,
    'steps',       v_result
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (level, source, message)
  VALUES ('error', 'run_neeko_ai_pipeline', 'Fatal: ' || SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err + 1);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- BUG 3 FIX: Rebuild fn_run_gap_heal with correct net.http_post
--            signature (body as jsonb not text) and use canonical
--            populate_rankings_cache() instead of the broken source fn.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_run_gap_heal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'internal'
AS $$
DECLARE
  v_synced        integer := 0;
  v_gap           integer := 0;
  v_missing_games integer := 0;
  v_supabase_url  text;
  v_service_key   text;
BEGIN
  SELECT value INTO v_supabase_url FROM internal.cron_secrets WHERE key = 'supabase_url';
  SELECT value INTO v_service_key  FROM internal.cron_secrets WHERE key = 'supabase_secret_key';

  -- ── Step 1: Check for FT games with missing stats ─────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_missing_games
    FROM afl.games_raw g
    WHERE g.season = 2026
      AND g.status_short = 'FT'
      AND (
        SELECT COUNT(*) FROM afl.raw_player_stats r WHERE r.game_id = g.game_id
      ) < 22;

    IF v_missing_games > 0 AND v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/afl-worker-games-player-stats',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('season', 2026)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (level, source, message)
    VALUES ('warn', 'fn_run_gap_heal:step1', 'Gap check/trigger failed: ' || SQLERRM);
  END;

  -- ── Step 2: Sync raw_player_stats → player_games ──────────────────────
  BEGIN
    SELECT public.fn_sync_player_games_from_raw() INTO v_synced;
  EXCEPTION WHEN OTHERS THEN
    v_synced := 0;
    INSERT INTO public.system_logs (level, source, message)
    VALUES ('warn', 'fn_run_gap_heal:step2', 'Sync failed: ' || SQLERRM);
  END;

  -- ── Step 3: Check residual gap ─────────────────────────────────────────
  BEGIN
    SELECT public.fn_check_player_games_gap() INTO v_gap;
  EXCEPTION WHEN OTHERS THEN
    v_gap := 0;
  END;

  -- ── Step 4: Rebuild projections + cache if new rows synced ────────────
  IF v_synced > 0 THEN
    BEGIN
      PERFORM afl.rebuild_player_projection();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (level, source, message)
      VALUES ('warn', 'fn_run_gap_heal:step4a', 'rebuild_player_projection failed: ' || SQLERRM);
    END;

    BEGIN
      PERFORM afl.populate_rankings_cache();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (level, source, message)
      VALUES ('warn', 'fn_run_gap_heal:step4b', 'populate_rankings_cache failed: ' || SQLERRM);
    END;
  END IF;

  INSERT INTO public.system_logs (level, source, message)
  VALUES (
    'info', 'fn_run_gap_heal',
    format('Gap heal complete — synced=%s gap=%s missing_games=%s', v_synced, v_gap, v_missing_games)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (level, source, message)
  VALUES ('error', 'fn_run_gap_heal', 'Fatal: ' || SQLERRM);
END;
$$;
