/*
  # Fix player_prices primary key and rebuild commit_price_round as idempotent UPSERT

  ## Problem
  `afl.player_prices` has TWO constraints that conflict:
    1. `player_prices_pkey1`  — PRIMARY KEY on (player_id) alone
    2. `player_prices_player_season_round_uq` — UNIQUE on (player_id, season, round)

  The PK on (player_id) alone means only ONE row per player can ever exist,
  even across different seasons/rounds. The DELETE + INSERT pattern still crashes
  when the session tries to re-insert a player_id that already exists from a
  different round in the same transaction window, or when is_locked=false rows
  survive.

  ## Fix
  1. Drop the broken single-column PK.
  2. Drop the separate unique index (it becomes the new PK).
  3. Add composite PK on (player_id, season, round).
  4. Rebuild commit_price_round using UPSERT ON CONFLICT (player_id, season, round)
     with DISTINCT ON deduplication of the input JSON array.
  5. Remove reliance on DELETE before INSERT entirely.

  ## Tables modified
  - afl.player_prices — PK changed from (player_id) to (player_id, season, round)

  ## Functions modified
  - afl.commit_price_round — DELETE+INSERT → UPSERT + DISTINCT ON dedup
  - public.commit_price_round — wrapper updated to match
*/

-- ─── Step 1: Drop the broken single-column primary key ───────────────────────
-- We must drop constraints before recreating.
-- The PK creates an implicit index; drop it by constraint name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_prices_pkey1'
      AND conrelid = 'afl.player_prices'::regclass
  ) THEN
    ALTER TABLE afl.player_prices DROP CONSTRAINT player_prices_pkey1;
  END IF;
END $$;

-- ─── Step 2: Drop the separate unique index (will be replaced by new PK) ─────
DROP INDEX IF EXISTS afl.player_prices_player_season_round_uq;

-- ─── Step 3: Add composite primary key on (player_id, season, round) ─────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_prices_pkey'
      AND conrelid = 'afl.player_prices'::regclass
  ) THEN
    ALTER TABLE afl.player_prices
      ADD CONSTRAINT player_prices_pkey PRIMARY KEY (player_id, season, round);
  END IF;
END $$;

-- ─── Step 4: Rebuild afl.commit_price_round with UPSERT + DISTINCT ON dedup ──
CREATE OR REPLACE FUNCTION afl.commit_price_round(
  p_rows   JSONB,
  p_season INTEGER DEFAULT 2026,
  p_round  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked    BOOLEAN;
  v_upserted  INTEGER;
BEGIN
  -- Lock check
  SELECT is_locked INTO v_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_locked IS TRUE THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Round %s is locked. Unlock it before committing prices.', p_round)
    );
  END IF;

  -- Ensure price_rounds row exists
  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (
    p_season,
    p_round,
    CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
    false
  )
  ON CONFLICT (season, round) DO NOTHING;

  -- UPSERT prices — deduplicate input first via DISTINCT ON player_id
  -- so duplicate player_id rows in the JSON payload don't cause conflicts
  INSERT INTO afl.player_prices (player_id, price, season, round, status, updated_at, created_at)
  SELECT
    deduped.player_id,
    deduped.cleaned_price,
    p_season,
    p_round,
    afl.normalise_player_status(deduped.player_status),
    now(),
    now()
  FROM (
    SELECT DISTINCT ON ((r->>'player_id')::INTEGER)
      (r->>'player_id')::INTEGER  AS player_id,
      (r->>'cleaned_price')::INTEGER AS cleaned_price,
      r->>'player_status'         AS player_status
    FROM jsonb_array_elements(p_rows) AS r
    WHERE (r->>'player_id') IS NOT NULL
      AND (r->>'cleaned_price') IS NOT NULL
    ORDER BY (r->>'player_id')::INTEGER
  ) deduped
  ON CONFLICT (player_id, season, round)
  DO UPDATE SET
    price      = EXCLUDED.price,
    status     = EXCLUDED.status,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',       true,
    'season',   p_season,
    'round',    p_round,
    'upserted', v_upserted,
    'total',    v_upserted
  );
END;
$$;

-- ─── Step 5: Rebuild public.commit_price_round wrapper ───────────────────────
CREATE OR REPLACE FUNCTION public.commit_price_round(
  p_rows   JSONB,
  p_season INTEGER DEFAULT 2026,
  p_round  INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT afl.commit_price_round(p_rows, p_season, p_round);
$$;

GRANT EXECUTE ON FUNCTION public.commit_price_round(JSONB, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_price_round(JSONB, INTEGER, INTEGER) TO service_role;
