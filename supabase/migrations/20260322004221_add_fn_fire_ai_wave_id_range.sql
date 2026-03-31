
/*
  # Add ID-range wave function for parallel AI generation

  Creates fn_fire_ai_worker_wave_range that targets a fixed player_id band,
  ensuring concurrent waves never overlap regardless of regen state changes.
*/

CREATE OR REPLACE FUNCTION public.fn_fire_ai_worker_wave_range(
  p_id_gte      int,
  p_id_lt       int,
  p_limit       int DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token    text;
  v_base_url text;
BEGIN
  SELECT value INTO v_token FROM internal.cron_secrets WHERE key = 'supabase_secret_key';
  IF v_token IS NULL OR v_token = '' THEN
    SELECT value INTO v_token FROM internal.cron_secrets WHERE key = 'cron_auth_token';
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
        'limit_players',  p_limit,
        'player_id_gte',  p_id_gte,
        'player_id_lt',   p_id_lt
      ),
      timeout_milliseconds := 110000
    );
  END IF;
END;
$$;
