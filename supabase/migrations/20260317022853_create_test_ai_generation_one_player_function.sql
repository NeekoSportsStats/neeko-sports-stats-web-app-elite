
/*
  # Create public.test_ai_generation_one_player()

  Selects one player from v_ai_player_analysis_input (highest neeko_rating,
  no existing analysis), calls the generate-player-ai edge function with
  limit_players=1, then returns the player_id processed.

  Uses internal.cron_secrets for the service key and URL so it works
  inside the same credential pattern as the pipeline.
*/

CREATE OR REPLACE FUNCTION public.test_ai_generation_one_player()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ai', 'afl', 'internal'
AS $$
DECLARE
  v_player_id   integer;
  v_player_name text;
  v_service_key text;
  v_base_url    text;
  v_response    text;
BEGIN
  -- Pick the best candidate: no analysis yet, highest neeko_rating
  SELECT player_id, player_name
  INTO v_player_id, v_player_name
  FROM public.v_ai_player_analysis_input
  WHERE analysis IS NULL
  ORDER BY neeko_rating DESC NULLS LAST
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN 'No players pending analysis — ai.player_ai_analysis is fully populated';
  END IF;

  -- Resolve secrets
  BEGIN
    v_service_key := internal.get_cron_secret('supabase_secret_key');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_service_key
    FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
  END;

  BEGIN
    v_base_url := internal.get_cron_secret('supabase_url');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_base_url
    FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
  END;

  v_base_url := rtrim(COALESCE(v_base_url, 'https://zbomenuickrogthnsozb.supabase.co'), '/') || '/functions/v1';

  -- Call generate-player-ai with limit_players=1
  SELECT content::text INTO v_response
  FROM net.http_post(
    url     := v_base_url || '/generate-player-ai',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('limit_players', 1)
  );

  -- Log result
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'ai_test_generation', 'test_ai_generation_one_player', 'info',
    'Test AI generation triggered for player: ' || COALESCE(v_player_name, v_player_id::text),
    jsonb_build_object(
      'player_id',   v_player_id,
      'player_name', v_player_name,
      'response',    v_response
    )
  );

  RETURN 'Triggered AI generation for player_id=' || v_player_id || ' (' || COALESCE(v_player_name, 'unknown') || '). Response: ' || COALESCE(v_response, 'null');
END;
$$;
