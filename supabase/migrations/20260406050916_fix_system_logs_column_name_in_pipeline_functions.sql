/*
  # Fix system_logs Column Names in Pipeline Functions

  ## Summary
  The previous migration wrote INSERT INTO public.system_logs (level, source, message)
  but the actual column is `log_level` not `level`, and `event_type` is also required.
  Rebuild the three functions with correct column names.

  Also enqueues stale AI players.

  ## Columns in public.system_logs
    id, log_level, source, event_type, message, metadata, created_at
*/

-- ─── Fix run_neeko_ai_pipeline logs ──────────────────────────────────────────
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
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'run_neeko_ai_pipeline', 'stale_count_error', 'Could not count stale players: ' || SQLERRM);
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
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('error', 'run_neeko_ai_pipeline', 'step1_error', 'mark_players_needing_regen failed: ' || SQLERRM);
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
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('error', 'run_neeko_ai_pipeline', 'step2_error', 'fire_generate_player_ai failed: ' || SQLERRM);
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
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES (
      'info', 'run_neeko_ai_pipeline', 'pipeline_complete',
      format('AI pipeline complete — stale=%s steps_ok=%s steps_err=%s',
             v_stale_count, v_steps_ok, v_steps_err)
    );
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    v_steps_err := v_steps_err + 1;
  END;
  v_result := v_result || jsonb_build_object(
    'step', 3, 'name', 'log_completion', 'status', 'ok',
    'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start)) * 1000
  );

  UPDATE public.pipeline_runs
  SET status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      completed_tasks    = v_steps_ok,
      current_step_label = 'Done',
      finished_at        = clock_timestamp()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id',      v_run_id,
    'steps_ok',    v_steps_ok,
    'steps_err',   v_steps_err,
    'stale_count', v_stale_count,
    'steps',       v_result
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES ('error', 'run_neeko_ai_pipeline', 'fatal_error', 'Fatal: ' || SQLERRM);
  RETURN jsonb_build_object('error', SQLERRM, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err + 1);
END;
$$;

-- ─── Fix fn_run_gap_heal logs ─────────────────────────────────────────────────
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

  -- ── Step 1: Check FT games missing stats ──────────────────────────────
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
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'fn_run_gap_heal', 'step1_error', 'Gap check/trigger failed: ' || SQLERRM);
  END;

  -- ── Step 2: Sync raw stats → player games ────────────────────────────
  BEGIN
    SELECT public.fn_sync_player_games_from_raw() INTO v_synced;
  EXCEPTION WHEN OTHERS THEN
    v_synced := 0;
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'fn_run_gap_heal', 'step2_error', 'Sync failed: ' || SQLERRM);
  END;

  -- ── Step 3: Check residual gap ────────────────────────────────────────
  BEGIN
    SELECT public.fn_check_player_games_gap() INTO v_gap;
  EXCEPTION WHEN OTHERS THEN
    v_gap := 0;
  END;

  -- ── Step 4: Rebuild projections + cache if new rows synced ───────────
  IF v_synced > 0 THEN
    BEGIN
      PERFORM afl.rebuild_player_projection();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4a_error', 'rebuild_player_projection failed: ' || SQLERRM);
    END;

    BEGIN
      PERFORM afl.populate_rankings_cache();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4b_error', 'populate_rankings_cache failed: ' || SQLERRM);
    END;
  END IF;

  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES (
    'info', 'fn_run_gap_heal', 'gap_heal_complete',
    format('Gap heal complete — synced=%s gap=%s missing_games=%s', v_synced, v_gap, v_missing_games)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES ('error', 'fn_run_gap_heal', 'fatal_error', 'Fatal: ' || SQLERRM);
END;
$$;

-- ─── Enqueue stale AI players ─────────────────────────────────────────────────
UPDATE ai.player_ai_analysis
SET needs_regen = true
WHERE (generated_at < now() - interval '3 days' OR generated_at IS NULL)
  AND player_id IN (
    SELECT player_id FROM afl.player_rankings_cache WHERE player_id IS NOT NULL
  );

UPDATE ai.player_ai_analysis
SET needs_regen = true
WHERE summary_short IS NULL OR summary_short = '';

UPDATE afl.player_rankings_cache rc
SET
  summary_short = pa.summary_short,
  summary_long  = pa.summary_long
FROM ai.player_ai_analysis pa
WHERE pa.player_id = rc.player_id
  AND pa.summary_short IS NOT NULL
  AND pa.summary_short != '';

INSERT INTO public.system_logs (log_level, source, event_type, message)
SELECT
  'info',
  'pipeline_fix',
  'stale_ai_enqueued',
  format('Stale AI marked — needs_regen=true on %s of %s players; wave cron will pick up next cycle',
         (SELECT COUNT(*) FROM ai.player_ai_analysis WHERE needs_regen = true),
         (SELECT COUNT(*) FROM ai.player_ai_analysis));
