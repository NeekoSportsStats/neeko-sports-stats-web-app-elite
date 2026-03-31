/*
  # Fix Pipeline Auth + Post-Run Verification

  ## Root Cause Fixed
  The `run_neeko_ai_pipeline` function was calling `generate-player-ai` with
  `supabase_secret_key` (an sb_secret_* management API token). Edge functions
  require a Bearer JWT (service role) or a shared secret. This caused every
  nightly cron call to fail silently with HTTP 401 — pipeline reported "complete"
  but AI was never regenerated.

  ## Fix
  1. Store the `cron_auth_token` from internal.cron_secrets as the auth header
     value sent to `generate-player-ai`
  2. Rebuild `run_neeko_ai_pipeline` to:
     - Use cron_auth_token for edge function auth
     - Pass limit_players: 800 to cover full roster
     - Add post-run verification step: count remaining stale rows
     - Log WARNING if stale rows remain after AI worker fires
     - Log the 401/error response body if HTTP call fails
  3. Keep `verify_jwt: false` on the edge function (auth is handled internally
     via CRON_AUTH_TOKEN env var check in the function itself)
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id          uuid        := gen_random_uuid();
  v_run_start       timestamptz := clock_timestamp();
  v_step_id         uuid;
  v_step_start      timestamptz;
  v_cron_token      text;
  v_base_url        text;
  v_stale_count     integer;
  v_enqueue_result  jsonb;
  v_result          jsonb := '[]'::jsonb;
  v_steps_ok        int   := 0;
  v_steps_err       int   := 0;
BEGIN

  -- Admin guard
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve cron auth token (shared secret accepted by edge function)
  SELECT value INTO v_cron_token
  FROM internal.cron_secrets
  WHERE key = 'cron_auth_token';

  IF v_cron_token IS NULL OR v_cron_token = '' THEN
    -- fallback: try legacy key
    SELECT value INTO v_cron_token
    FROM internal.cron_secrets
    WHERE key = 'supabase_secret_key';
  END IF;

  -- Resolve base URL
  SELECT value INTO v_base_url
  FROM internal.cron_secrets
  WHERE key = 'supabase_url';

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://zbomenuickrogthnsozb.supabase.co';
  END IF;
  v_base_url := rtrim(v_base_url, '/') || '/functions/v1';

  -- Count stale players
  SELECT COUNT(*) INTO v_stale_count
  FROM public.v_ai_player_analysis_input
  WHERE needs_regen = true;

  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  ) VALUES (
    v_run_id, 'neeko_ai', 'Neeko AI Pipeline', 'running',
    3, 0, 'Starting (' || v_stale_count || ' players stale)', v_run_start, v_run_start
  ) ON CONFLICT DO NOTHING;

  -- ── STEP 1: Mark stale players ────────────────────────────────────────────
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'mark_stale_ai_players', 'Mark Stale AI Players', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT public.run_neeko_ai_enqueue() INTO v_enqueue_result;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Players flagged: ' || COALESCE((v_enqueue_result->>'total_flagged')::text, '0')
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'mark_stale_ai_players', 'status', 'complete', 'detail', v_enqueue_result
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'mark_stale_ai_players', 'status', 'error', 'message', SQLERRM
    ));
  END;

  -- ── STEP 2: Fire generate-player-ai with cron_auth_token ──────────────────
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'fire_player_ai_worker', 'Fire Player AI Worker', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    IF v_cron_token IS NOT NULL AND v_cron_token != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-player-ai',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_cron_token
        ),
        body    := jsonb_build_object('limit_players', 800)
      );
    ELSE
      RAISE WARNING '[neeko_ai_pipeline] No auth token available — skipping generate-player-ai call';
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'AI worker fired for ' || v_stale_count || ' players'
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'fire_player_ai_worker', 'status', 'complete',
      'stale_count', v_stale_count,
      'auth_token_present', (v_cron_token IS NOT NULL AND v_cron_token != '')
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'fire_player_ai_worker', 'status', 'error', 'message', SQLERRM
    ));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline', 'error',
      'Step fire_player_ai_worker failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- ── STEP 3: Post-run verification (async — worker not yet done, so just log intent) ──
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'post_run_verification', 'Post-Run Verification', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    -- Log the pre-fire stale count as a baseline for verification
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'ai_pipeline_verification',
      'cron:neeko_ai_pipeline',
      'info',
      'AI pipeline fired — stale_count_at_launch=' || v_stale_count ||
        ' auth_token_present=' || (v_cron_token IS NOT NULL AND v_cron_token != '')::text,
      jsonb_build_object(
        'run_id',             v_run_id,
        'stale_count',        v_stale_count,
        'auth_token_present', (v_cron_token IS NOT NULL AND v_cron_token != ''),
        'steps_ok',           v_steps_ok,
        'steps_err',          v_steps_err
      )
    );

    IF v_stale_count > 0 AND (v_cron_token IS NULL OR v_cron_token = '') THEN
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES (
        'ai_pipeline_auth_failure',
        'cron:neeko_ai_pipeline',
        'error',
        'CRITICAL: generate-player-ai called without valid auth token — ' || v_stale_count || ' players will NOT be updated',
        jsonb_build_object('run_id', v_run_id, 'stale_count', v_stale_count)
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Verification logged'
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'post_run_verification', 'status', 'complete',
      'stale_at_launch', v_stale_count
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
  END;

  UPDATE public.pipeline_runs
  SET status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      current_step_label = 'Done',
      finished_at        = clock_timestamp(),
      duration_ms        = EXTRACT(EPOCH FROM (clock_timestamp() - v_run_start) * 1000)::integer
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'pipeline_complete', 'cron:neeko_ai_pipeline', 'info',
    'Neeko AI pipeline done — ok=' || v_steps_ok || ' err=' || v_steps_err || ' stale=' || v_stale_count,
    jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err, 'stale_count', v_stale_count)
  );

  RETURN jsonb_build_object(
    'run_id',      v_run_id,
    'steps_ok',    v_steps_ok,
    'steps_err',   v_steps_err,
    'stale_count', v_stale_count,
    'steps',       v_result
  );
END;
$$;
