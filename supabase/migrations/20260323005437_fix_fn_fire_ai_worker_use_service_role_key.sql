/*
  # Fix fn_fire_ai_worker_wave — Use supabase_secret_key for Auth

  ## Problem
  The edge function generate-player-ai returns 401 Unauthorized when called
  from the cron. The secondary auth path queries internal.cron_secrets from
  within the edge function runtime — but this lookup appears to be failing
  (likely due to schema permissions or network timing within the function).

  The primary auth check is: token === SUPABASE_SERVICE_ROLE_KEY
  The supabase_secret_key stored in internal.cron_secrets IS the service role key.

  ## Fix
  Update fn_fire_ai_worker_wave to send supabase_secret_key (service role key)
  as the Authorization bearer token instead of cron_auth_token.
  This hits the PRIMARY auth path (direct string compare) — no DB lookup needed.
*/

CREATE OR REPLACE FUNCTION public.fn_fire_ai_worker_wave(
  p_limit_players integer DEFAULT 75,
  p_page_offset   integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token    text;
  v_base_url text;
BEGIN
  -- Use the service role key directly — matches primary auth in edge function
  SELECT value INTO v_token
  FROM internal.cron_secrets
  WHERE key = 'supabase_secret_key';

  -- Fallback to cron_auth_token if service key not found
  IF v_token IS NULL OR v_token = '' THEN
    SELECT value INTO v_token
    FROM internal.cron_secrets
    WHERE key = 'cron_auth_token';
  END IF;

  v_base_url := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1';

  IF v_token IS NOT NULL AND v_token != '' THEN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ai',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := jsonb_build_object(
        'limit_players', p_limit_players,
        'page_offset',   p_page_offset
      ),
      timeout_milliseconds := 110000
    );
  END IF;
END;
$$;
