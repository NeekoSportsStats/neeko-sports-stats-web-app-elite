
/*
  # AI Regen Batch Dispatcher v2

  Creates controlled batch dispatcher functions for regenerating all 687 player AI outputs.

  ## What this does
  - fn_dispatch_ai_regen_wave(gte, lt, limit): fires a single pg_net HTTP POST
    to generate-player-ai for a specific player_id shard
  - fn_run_ai_regen_all_waves(): fires 14 shards sequentially via pg_net
    (non-blocking; each wave runs independently in the edge function)

  ## Safety
  - 14 waves × 50 players = controlled, non-flooding approach
  - player_id_gte / player_id_lt shards are stable (don't shift as players complete)
  - limit_players = 50 per wave
  - Edge function batch size = 5 (within each wave)
  - No p_confidence written — RPC signature excludes it
  - needs_regen = TRUE filter applied inside edge function
  - Idempotent: already-complete players skipped by input_hash check
*/

CREATE OR REPLACE FUNCTION public.fn_dispatch_ai_regen_wave(
  p_id_gte   int,
  p_id_lt    int,
  p_limit    int DEFAULT 50
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
  v_url      text;
  v_token    text;
  v_body     text;
  v_req_id   bigint;
BEGIN
  SELECT value INTO v_token
  FROM internal.cron_secrets
  WHERE key = 'supabase_secret_key'
  LIMIT 1;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'fn_dispatch_ai_regen_wave: supabase_secret_key not found';
  END IF;

  SELECT value INTO v_url
  FROM internal.cron_secrets
  WHERE key = 'supabase_url'
  LIMIT 1;

  IF v_url IS NULL OR v_url = '' THEN
    RAISE EXCEPTION 'fn_dispatch_ai_regen_wave: supabase_url not found in cron_secrets';
  END IF;

  v_body := json_build_object(
    'limit_players',  p_limit,
    'player_id_gte',  p_id_gte,
    'player_id_lt',   p_id_lt
  )::text;

  SELECT net.http_post(
    url     := v_url || '/functions/v1/generate-player-ai',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := v_body::jsonb
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_dispatch_ai_regen_wave(int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dispatch_ai_regen_wave(int, int, int) TO service_role;

-- ── Full-roster dispatcher ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_run_ai_regen_all_waves()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
  v_waves  jsonb := '[]'::jsonb;
  v_req_id bigint;
  v_shards int[][] := ARRAY[
    ARRAY[   1,  200],
    ARRAY[ 200,  350],
    ARRAY[ 350,  500],
    ARRAY[ 500,  650],
    ARRAY[ 650,  800],
    ARRAY[ 800,  950],
    ARRAY[ 950, 1100],
    ARRAY[1100, 1250],
    ARRAY[1250, 1400],
    ARRAY[1400, 1550],
    ARRAY[1550, 1700],
    ARRAY[1700, 1850],
    ARRAY[1850, 2000],
    ARRAY[2000, 9999]
  ];
  v_shard int[];
BEGIN
  FOREACH v_shard SLICE 1 IN ARRAY v_shards LOOP
    BEGIN
      v_req_id := fn_dispatch_ai_regen_wave(v_shard[1], v_shard[2], 50);
      v_waves  := v_waves || jsonb_build_object('gte', v_shard[1], 'lt', v_shard[2], 'req_id', v_req_id);
    EXCEPTION WHEN OTHERS THEN
      v_waves := v_waves || jsonb_build_object('gte', v_shard[1], 'lt', v_shard[2], 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'waves_fired', jsonb_array_length(v_waves),
    'waves',       v_waves,
    'fired_at',    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_run_ai_regen_all_waves() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_run_ai_regen_all_waves() TO service_role;
