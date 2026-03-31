/*
  # Round-Based Price Ingest RPC

  ## Summary
  Replaces the previous "ON CONFLICT DO NOTHING" insert with a round-aware
  overwrite pipeline that:
    1. Creates the round in price_rounds if not present
    2. Checks if the round is locked — returns error if so
    3. DELETEs all existing rows for (season, round)
    4. INSERTs fresh rows
    5. Also upserts into player_price_history for time-series tracking

  ## New Functions
  - `afl.commit_price_round(p_rows jsonb, p_season int, p_round int)` — main ingest
  - `public.commit_price_round(p_rows jsonb, p_season int, p_round int)` — public wrapper
  - `public.set_price_round_lock(p_season int, p_round int, p_locked bool)` — lock toggle

  ## Updated Views
  - `public.v_player_prices_latest` — latest round per player with price delta
*/

-- ─── 1. Core round-based commit function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.commit_price_round(
  p_rows   JSONB,
  p_season INTEGER DEFAULT 2026,
  p_round  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_is_locked   BOOLEAN := false;
  v_label       TEXT;
  v_deleted     INTEGER := 0;
  v_inserted    INTEGER := 0;
  v_row         JSONB;
  v_player_id   BIGINT;
  v_price       INTEGER;
BEGIN
  -- Build default label
  IF p_round = 0 THEN
    v_label := 'Opening Round';
  ELSE
    v_label := 'Round ' || p_round::text;
  END IF;

  -- Step 1: Ensure round row exists
  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (p_season, p_round, v_label, false)
  ON CONFLICT (season, round) DO NOTHING;

  -- Step 2: Check lock
  SELECT is_locked INTO v_is_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_is_locked THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Round is locked. Unlock to overwrite.',
      'season', p_season,
      'round', p_round
    );
  END IF;

  -- Step 3: Delete existing rows for this round
  DELETE FROM afl.player_prices
  WHERE season = p_season AND round = p_round;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Step 4: Insert fresh rows
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_player_id := (v_row->>'player_id')::BIGINT;
    v_price     := (v_row->>'cleaned_price')::INTEGER;

    IF v_player_id IS NULL OR v_price IS NULL OR v_price <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO afl.player_prices (player_id, price, season, round, is_locked, updated_at)
    VALUES (v_player_id, v_price, p_season, p_round, false, now())
    ON CONFLICT (player_id, season, round) DO UPDATE
      SET price = EXCLUDED.price, updated_at = now();

    -- Also upsert into history table for time-series
    INSERT INTO afl.player_price_history (player_id, price, round_number, season, created_at)
    VALUES (v_player_id, v_price, p_round, p_season, now())
    ON CONFLICT (player_id, season, round_number) DO UPDATE
      SET price = EXCLUDED.price;

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',        true,
    'season',    p_season,
    'round',     p_round,
    'deleted',   v_deleted,
    'inserted',  v_inserted,
    'total',     jsonb_array_length(p_rows)
  );
END;
$$;

-- ─── 2. Public wrapper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commit_price_round(
  p_rows   JSONB,
  p_season INTEGER DEFAULT 2026,
  p_round  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = afl, public
AS $$
  SELECT afl.commit_price_round(p_rows, p_season, p_round);
$$;

GRANT EXECUTE ON FUNCTION public.commit_price_round TO service_role;

-- ─── 3. Lock/Unlock RPC ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_price_round_lock(
  p_season  INTEGER,
  p_round   INTEGER,
  p_locked  BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_label TEXT;
BEGIN
  IF p_round = 0 THEN v_label := 'Opening Round';
  ELSE v_label := 'Round ' || p_round::text;
  END IF;

  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (p_season, p_round, v_label, p_locked)
  ON CONFLICT (season, round) DO UPDATE
    SET is_locked = EXCLUDED.is_locked;

  -- Mirror lock state onto individual price rows
  UPDATE afl.player_prices
  SET is_locked = p_locked
  WHERE season = p_season AND round = p_round;

  RETURN jsonb_build_object('ok', true, 'season', p_season, 'round', p_round, 'is_locked', p_locked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_price_round_lock TO service_role;

-- ─── 4. v_player_prices_latest — latest round per player with price delta ─────
CREATE OR REPLACE VIEW public.v_player_prices_latest
WITH (security_invoker = false)
AS
SELECT DISTINCT ON (curr.player_id)
  curr.player_id,
  curr.price                                   AS current_price,
  curr.season,
  curr.round,
  prev.price                                   AS last_round_price,
  curr.price - COALESCE(prev.price, curr.price) AS price_change,
  CASE
    WHEN prev.price IS NULL THEN 0
    ELSE ROUND(
      ((curr.price - prev.price)::NUMERIC / NULLIF(prev.price, 0)) * 100,
      1
    )
  END                                          AS price_change_pct,
  curr.is_locked,
  curr.updated_at
FROM afl.player_prices curr
LEFT JOIN afl.player_prices prev
  ON prev.player_id = curr.player_id
  AND prev.season = curr.season
  AND prev.round = curr.round - 1
ORDER BY curr.player_id, curr.round DESC;

GRANT SELECT ON public.v_player_prices_latest TO authenticated;
GRANT SELECT ON public.v_player_prices_latest TO anon;
