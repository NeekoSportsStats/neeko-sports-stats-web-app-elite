/*
  # Phase 4: Remove Hardcoded Cron Token from Job 194

  ## Problem
  Cron job 194 (ai_regen_wave_5min) has the auth token hardcoded directly
  in the pg_cron command string. This means the token is visible in plaintext
  to anyone with SELECT access on cron.job.

  ## Fix
  1. Create a SECURITY DEFINER wrapper function public.fn_fire_ai_worker_wave()
     that reads the token from internal.cron_secrets at runtime.
  2. Update cron job 194 to call the wrapper instead of hardcoding the token.

  ## Security
  - The wrapper is SECURITY DEFINER so it can read internal.cron_secrets
  - The cron command string no longer contains any secret material
  - The token is only held in memory during execution
*/

-- Step 1: Create wrapper function that reads token at runtime
CREATE OR REPLACE FUNCTION public.fn_fire_ai_worker_wave(
  p_limit_players integer DEFAULT 20
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal'
AS $$
DECLARE
  v_token    text;
  v_base_url text;
BEGIN
  SELECT value INTO v_token
  FROM internal.cron_secrets
  WHERE key = 'cron_auth_token';

  IF v_token IS NULL OR v_token = '' THEN
    SELECT value INTO v_token
    FROM internal.cron_secrets
    WHERE key = 'supabase_secret_key';
  END IF;

  SELECT value INTO v_base_url
  FROM internal.cron_secrets
  WHERE key = 'supabase_url';

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://zbomenuickrogthnsozb.supabase.co';
  END IF;

  v_base_url := rtrim(v_base_url, '/') || '/functions/v1';

  IF v_token IS NOT NULL AND v_token != '' THEN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ai',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := jsonb_build_object('limit_players', p_limit_players),
      timeout_milliseconds := 110000
    );
  ELSE
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'cron_auth_failure', 'cron:ai_regen_wave',
      'error',
      'fn_fire_ai_worker_wave: no auth token found in internal.cron_secrets -- skipping HTTP call',
      jsonb_build_object('limit_players', p_limit_players)
    );
  END IF;
END;
$$;

-- Step 2: Update cron job 194 to use the wrapper (no token in command string)
SELECT cron.alter_job(
  job_id   := 194,
  command  := 'SELECT public.fn_fire_ai_worker_wave(20);'
);
