
/*
  # Fix test_ai_generation_one_player — async pg_net pattern

  net.http_post() returns a bigint request_id (fire-and-forget).
  The response is written to net._http_response after completion.
  We fire the request, wait 8 seconds, then poll for the result.
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
  v_request_id  bigint;
  v_status      integer;
  v_body        text;
BEGIN
  -- Pick best candidate: no analysis, highest neeko_rating
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

  -- Fire async HTTP request
  SELECT net.http_post(
    url     := v_base_url || '/generate-player-ai',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('limit_players', 1),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  -- Wait for response (pg_net processes async — poll for up to 15s)
  FOR i IN 1..15 LOOP
    PERFORM pg_sleep(1);
    SELECT status_code, (response).body
    INTO v_status, v_body
    FROM net._http_response
    WHERE id = v_request_id;

    EXIT WHEN v_status IS NOT NULL;
  END LOOP;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'ai_test_generation', 'test_ai_generation_one_player', 'info',
    'Test AI generation for: ' || COALESCE(v_player_name, v_player_id::text),
    jsonb_build_object(
      'player_id',    v_player_id,
      'player_name',  v_player_name,
      'request_id',   v_request_id,
      'http_status',  v_status,
      'response',     LEFT(COALESCE(v_body, ''), 500)
    )
  );

  RETURN format(
    'player_id=%s (%s) | request_id=%s | http_status=%s | response=%s',
    v_player_id,
    COALESCE(v_player_name, 'unknown'),
    v_request_id,
    COALESCE(v_status::text, 'pending'),
    LEFT(COALESCE(v_body, 'no response yet'), 300)
  );
END;
$$;
