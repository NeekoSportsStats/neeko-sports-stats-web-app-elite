/*
  # Start/Sit Decisions: Rate Limiting and Validation

  ## Summary
  Replaces open INSERT policies on start_sit_decisions with a validated, rate-limited
  RPC function. Direct table inserts from anon/authenticated are removed.

  ## Changes

  ### 1. Rate limit tracking table
  - `start_sit_rate_limit` — tracks insert counts per session_id per hour
  - Indexed on (session_id, window_start) for fast lookups
  - Auto-cleaned: rows older than 2 hours are pruned on each call

  ### 2. New RPC: record_start_sit_decision
  - SECURITY DEFINER — only this function can insert into the table
  - Validates:
    a) player_a_id != player_b_id (no self-comparisons)
    b) player_a_id and player_b_id are valid integers
    c) Both players exist in player_rankings_cache
    d) winner_player_id is one of the two players
    e) Rate limit: max 20 inserts per session per hour (anon or auth)
  - Returns: {ok: true} or {ok: false, error: "reason"}

  ### 3. RLS tightening
  - Remove open anon INSERT policy (WITH CHECK true)
  - Remove open authenticated INSERT policy (WITH CHECK true)
  - Direct inserts are now blocked — must go through the RPC
  - SELECT stays open (read is fine, only writes are restricted)
  - service_role retains full access for pipeline/admin operations
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Rate limit tracking table
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.start_sit_rate_limit (
  id          bigserial PRIMARY KEY,
  session_id  text        NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  insert_count integer     NOT NULL DEFAULT 1,
  last_insert  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT start_sit_rate_limit_session_window_unique UNIQUE (session_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_start_sit_rate_limit_session_window
  ON public.start_sit_rate_limit (session_id, window_start);

ALTER TABLE public.start_sit_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limit table"
  ON public.start_sit_rate_limit FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. RPC: record_start_sit_decision
--    All validation and rate-limiting enforced here. Returns jsonb result.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_start_sit_decision(
  p_player_a_id      text,
  p_player_b_id      text,
  p_player_a_name    text,
  p_player_b_name    text,
  p_winner_player_id text,
  p_session_id       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl'
AS $$
DECLARE
  v_session_id       text;
  v_player_a_int     integer;
  v_player_b_int     integer;
  v_winner_int       integer;
  v_a_exists         boolean := false;
  v_b_exists         boolean := false;
  v_current_window   timestamptz;
  v_current_count    integer := 0;
  v_rate_limit       integer := 20;
BEGIN
  -- ── 1. Sanitise session_id ────────────────────────────────────────────────
  -- Use provided session_id (from browser crypto.randomUUID), falling back to
  -- auth.uid() for logged-in users, then a truncated IP-like key.
  v_session_id := COALESCE(
    NULLIF(trim(p_session_id), ''),
    auth.uid()::text,
    'anon'
  );

  -- Clamp session_id length to prevent abuse
  v_session_id := left(v_session_id, 64);

  -- ── 2. Validate player IDs are integers ──────────────────────────────────
  BEGIN
    v_player_a_int := p_player_a_id::integer;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid player_a_id');
  END;

  BEGIN
    v_player_b_int := p_player_b_id::integer;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid player_b_id');
  END;

  -- ── 3. No self-comparison ────────────────────────────────────────────────
  IF v_player_a_int = v_player_b_int THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Players must be different');
  END IF;

  -- ── 4. Validate winner is one of the two players ─────────────────────────
  IF p_winner_player_id IS NOT NULL AND p_winner_player_id != '' THEN
    BEGIN
      v_winner_int := p_winner_player_id::integer;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid winner_player_id');
    END;

    IF v_winner_int != v_player_a_int AND v_winner_int != v_player_b_int THEN
      RETURN jsonb_build_object('ok', false, 'error', 'winner_player_id must be one of the two players');
    END IF;
  END IF;

  -- ── 5. Validate both players exist in rankings cache ─────────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.player_rankings_cache WHERE player_id = v_player_a_int
  ) INTO v_a_exists;

  SELECT EXISTS (
    SELECT 1 FROM public.player_rankings_cache WHERE player_id = v_player_b_int
  ) INTO v_b_exists;

  IF NOT v_a_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_a not found');
  END IF;

  IF NOT v_b_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_b not found');
  END IF;

  -- ── 6. Rate limit: max 20 inserts per session per hour ───────────────────
  v_current_window := date_trunc('hour', now());

  -- Clean up rows older than 2 hours (keep table small)
  DELETE FROM public.start_sit_rate_limit
  WHERE window_start < (now() - interval '2 hours');

  -- Upsert rate limit counter
  INSERT INTO public.start_sit_rate_limit (session_id, window_start, insert_count, last_insert)
  VALUES (v_session_id, v_current_window, 1, now())
  ON CONFLICT (session_id, window_start)
  DO UPDATE SET
    insert_count = start_sit_rate_limit.insert_count + 1,
    last_insert  = now()
  RETURNING insert_count INTO v_current_count;

  IF v_current_count > v_rate_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Rate limit exceeded — try again next hour',
      'limit', v_rate_limit,
      'used', v_current_count
    );
  END IF;

  -- ── 7. Validated insert ───────────────────────────────────────────────────
  INSERT INTO public.start_sit_decisions (
    player_a_id,
    player_a_name,
    player_b_id,
    player_b_name,
    winner_player_id,
    session_id
  ) VALUES (
    p_player_a_id,
    left(trim(p_player_a_name), 100),
    p_player_b_id,
    left(trim(p_player_b_name), 100),
    p_winner_player_id,
    v_session_id
  );

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'Internal error');
END;
$$;

-- Grant execute to anon and authenticated (function body enforces all limits)
REVOKE ALL ON FUNCTION public.record_start_sit_decision(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_start_sit_decision(text, text, text, text, text, text) TO anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Tighten RLS: remove open INSERT policies, block direct table writes
--    All inserts must go through record_start_sit_decision (SECURITY DEFINER)
-- ══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow anon insert to start_sit_decisions" ON public.start_sit_decisions;
DROP POLICY IF EXISTS "Authenticated users can insert decisions" ON public.start_sit_decisions;

-- No replacement INSERT policy for anon/authenticated:
-- The SECURITY DEFINER RPC runs as the function owner (postgres/service_role)
-- and can write to the table. Direct inserts from clients are now blocked.
