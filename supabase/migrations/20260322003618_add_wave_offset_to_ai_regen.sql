
/*
  # Add wave offset support to AI regen

  Adds a helper function that fires a wave targeting a specific player_id offset
  bucket (player_id % total_shards = shard_id), so concurrent waves don't
  redundantly pick the same players.
*/

CREATE OR REPLACE FUNCTION public.fn_fire_ai_worker_wave_shard(
  p_shard       int  DEFAULT 0,
  p_total_shards int DEFAULT 1,
  p_limit       int  DEFAULT 20
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
        'limit_players', p_limit,
        'shard',         p_shard,
        'total_shards',  p_total_shards
      ),
      timeout_milliseconds := 110000
    );
  END IF;
END;
$$;
