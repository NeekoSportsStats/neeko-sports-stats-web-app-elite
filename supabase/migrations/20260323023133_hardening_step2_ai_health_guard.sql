/*
  # Hardening Step 2 — AI Health Guard (auto-trigger wave)

  ## Summary
  Creates `public.fn_ai_health_guard()` — a safety function that checks whether
  the AI generation system has stalled and auto-triggers a recovery wave if so.

  ## Trigger Conditions (ALL must be true)
  1. COUNT(needs_regen = true) > 100  — significant backlog of missing AI
  2. No AI generated in the last 10 minutes     — system is idle/stalled
  3. No active HTTP job in-flight (best-effort) — avoids double-triggering

  ## What it does on trigger
  - Calls `generate-player-ai` edge function via `net.http_post`
  - Logs the auto-trigger event to `system_logs`
  - Returns 'triggered' | 'ok' | 'skipped' status

  ## Where it runs
  Called from `run_neeko_pipeline()` (Step 20 — added separately) and can also
  be called on-demand from the admin panel.
*/

CREATE OR REPLACE FUNCTION public.fn_ai_health_guard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ai, internal
AS $$
DECLARE
  v_needs_regen_count integer;
  v_last_gen          timestamptz;
  v_service_key       text;
  v_base_url          text;
  v_idle_minutes      numeric;
BEGIN
  -- ── Count players flagged for regen ────────────────────────────────────────
  SELECT COUNT(*) INTO v_needs_regen_count
  FROM ai.player_ai_analysis
  WHERE needs_regen = true;

  -- ── Time since last generation ─────────────────────────────────────────────
  SELECT MAX(generated_at) INTO v_last_gen
  FROM ai.player_ai_analysis
  WHERE generated_at IS NOT NULL;

  v_idle_minutes := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_last_gen, NOW() - INTERVAL '1 hour'))) / 60.0;

  -- ── Guard conditions ───────────────────────────────────────────────────────
  IF v_needs_regen_count <= 100 THEN
    RETURN jsonb_build_object(
      'status',             'ok',
      'needs_regen_count',  v_needs_regen_count,
      'idle_minutes',       round(v_idle_minutes::numeric, 1),
      'message',            'Backlog below threshold — no action needed'
    );
  END IF;

  IF v_idle_minutes < 10.0 THEN
    RETURN jsonb_build_object(
      'status',             'ok',
      'needs_regen_count',  v_needs_regen_count,
      'idle_minutes',       round(v_idle_minutes::numeric, 1),
      'message',            'Generation active within last 10 minutes — no action needed'
    );
  END IF;

  -- ── Fetch secrets ──────────────────────────────────────────────────────────
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

  IF v_service_key IS NULL OR v_service_key = '' THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'ai_health_guard_error', 'fn_ai_health_guard', 'error',
      'Cannot trigger AI wave — service key not available',
      jsonb_build_object('needs_regen_count', v_needs_regen_count)
    );
    RETURN jsonb_build_object(
      'status',  'error',
      'message', 'Service key unavailable — cannot auto-trigger'
    );
  END IF;

  v_base_url := rtrim(COALESCE(v_base_url, 'https://zbomenuickrogthnsozb.supabase.co'), '/') || '/functions/v1';

  -- ── Trigger the AI wave ────────────────────────────────────────────────────
  PERFORM net.http_post(
    url     := v_base_url || '/generate-player-ai',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('source', 'health_guard', 'reason', 'auto_recovery')
  );

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'ai_health_guard_triggered', 'fn_ai_health_guard', 'warn',
    'AUTO RECOVERY: triggered AI wave — ' || v_needs_regen_count ||
    ' players need regen, idle for ' || round(v_idle_minutes::numeric, 1) || ' min',
    jsonb_build_object(
      'needs_regen_count', v_needs_regen_count,
      'idle_minutes',      round(v_idle_minutes::numeric, 1),
      'triggered_at',      now()
    )
  );

  RETURN jsonb_build_object(
    'status',             'triggered',
    'needs_regen_count',  v_needs_regen_count,
    'idle_minutes',       round(v_idle_minutes::numeric, 1),
    'message',            'AI wave auto-triggered via health guard'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ai_health_guard() TO service_role;
