/*
  # Enable Parallel AI Generation Waves via ID-Range Sharding

  ## Summary
  Doubles AI throughput by firing two concurrent waves per cron cycle, each
  targeting a non-overlapping player_id range so they never process the same
  player.

  ## Changes

  ### New Function
  - `public.fn_fire_ai_worker_wave_range(p_limit, p_id_gte, p_id_lt)`
    Fires generate-player-ai with `player_id_gte` / `player_id_lt` params
    (already supported by the edge function) rather than a page offset.
    This guarantees zero collision between parallel waves regardless of
    how many players have been regenerated.

  ### Cron Job Update (job 197 — ai_regen_wave_5min)
  - Old command: `SELECT public.fn_fire_ai_worker_wave(75, 0);`
  - New command: fires TWO waves simultaneously:
    - Wave A → player_id < 1450  (low ID range)
    - Wave B → player_id >= 1450 (high ID range)
    Each wave requests up to 75 players from its own shard.

  ## Why ID-Range Instead of OFFSET
  The edge function already supports `player_id_gte` / `player_id_lt` params
  (lines 489-490 in generate-player-ai/index.ts). Using OFFSET is unsafe for
  parallel execution because both waves would query the same ordered list and
  — after the first wave updates some rows — wave 2's OFFSET would shift,
  causing skips or re-processing. ID-range sharding is stable and idempotent.

  ## Expected Outcome
  - Throughput: ~8 → ~16 players/min
  - Backlog clearance: ~2x faster
  - No change to AI prompts, batch size, or DB schema
*/

-- ── Step 1: Create ID-range firing function ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_fire_ai_worker_wave_range(
  p_limit_players  integer DEFAULT 75,
  p_player_id_gte  integer DEFAULT NULL,
  p_player_id_lt   integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token    text;
  v_base_url text;
  v_body     jsonb;
BEGIN
  SELECT value INTO v_token
  FROM internal.cron_secrets
  WHERE key = 'supabase_secret_key';

  IF v_token IS NULL OR v_token = '' THEN
    SELECT value INTO v_token
    FROM internal.cron_secrets
    WHERE key = 'cron_auth_token';
  END IF;

  v_base_url := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1';

  v_body := jsonb_build_object('limit_players', p_limit_players);

  IF p_player_id_gte IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('player_id_gte', p_player_id_gte);
  END IF;

  IF p_player_id_lt IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('player_id_lt', p_player_id_lt);
  END IF;

  IF v_token IS NOT NULL AND v_token != '' THEN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ai',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body    := v_body,
      timeout_milliseconds := 110000
    );
  END IF;
END;
$$;

-- ── Step 2: Update cron job 197 to fire two parallel waves ────────────────
-- Wave A: player_id < 1450   (approx lower half of active roster)
-- Wave B: player_id >= 1450  (approx upper half of active roster)
-- The midpoint 1450 is close to the median (1457) of needs_regen players,
-- ensuring both waves have roughly equal workloads.

SELECT cron.alter_job(
  job_id  := 197,
  command := $cmd$
    SELECT public.fn_fire_ai_worker_wave_range(75, NULL, 1450);
    SELECT public.fn_fire_ai_worker_wave_range(75, 1450, NULL);
  $cmd$
);
