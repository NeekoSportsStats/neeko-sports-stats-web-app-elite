
/*
  # Update fn_fire_ai_worker_wave to support page_offset parameter

  Replaces the existing wave function so each call can target a distinct
  page of stale players, enabling true parallel processing without overlap.
*/

CREATE OR REPLACE FUNCTION public.fn_fire_ai_worker_wave(
  p_limit_players int DEFAULT 20,
  p_page_offset   int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token    text;
  v_base_url text;
BEGIN
  SELECT value INTO v_token FROM internal.cron_secrets WHERE key = 'cron_auth_token';
  IF v_token IS NULL OR v_token = '' THEN
    SELECT value INTO v_token FROM internal.cron_secrets WHERE key = 'supabase_secret_key';
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
