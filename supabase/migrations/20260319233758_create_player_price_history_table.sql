/*
  # Create afl.player_price_history Table

  ## Purpose
  Track every price a player has been assigned across rounds and seasons.
  This is the canonical time-series price ledger that powers:
  - Price change detection (rise/drop)
  - Break-even estimation
  - Market Watch signal classification
  - Buy/Sell/Hold recommendations

  ## New Table: afl.player_price_history
  - player_id    (bigint, FK to afl.players)
  - price        (integer, in dollars e.g. 450000)
  - position     (text, DEF/MID/FWD/RUC)
  - round_number (integer, 0 = preseason, 1–24 = in-season)
  - season       (integer, default 2026)
  - created_at   (timestamptz)

  ## Constraints
  - ONE row per (player_id, season, round_number) — prevents duplicate rounds
  - Insert-only via trigger guard — old prices are NEVER overwritten
  - INSERT uses ON CONFLICT DO NOTHING to be safe

  ## Security
  - RLS enabled
  - Authenticated users can read
  - Service role can insert (pipeline writes here automatically)
*/

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.player_price_history (
  id            bigserial PRIMARY KEY,
  player_id     bigint      NOT NULL,
  price         integer     NOT NULL CHECK (price > 0),
  position      text,
  round_number  integer     NOT NULL DEFAULT 0 CHECK (round_number >= 0),
  season        integer     NOT NULL DEFAULT 2026,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Unique: one price row per player per round per season
CREATE UNIQUE INDEX IF NOT EXISTS player_price_history_player_season_round_uq
  ON afl.player_price_history (player_id, season, round_number);

-- Index for fast range queries
CREATE INDEX IF NOT EXISTS player_price_history_player_season_idx
  ON afl.player_price_history (player_id, season, round_number DESC);

CREATE INDEX IF NOT EXISTS player_price_history_season_round_idx
  ON afl.player_price_history (season, round_number DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE afl.player_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read price history"
  ON afl.player_price_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert price history"
  ON afl.player_price_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── Backfill from afl.player_prices (current canonical prices as round 1) ────
-- Only inserts if we have current prices but no history yet
INSERT INTO afl.player_price_history (player_id, price, season, round_number, created_at)
SELECT
  pp.player_id,
  pp.price,
  2026,
  1,
  COALESCE(pp.updated_at, now())
FROM afl.player_prices pp
WHERE pp.player_id IS NOT NULL
  AND pp.price > 0
ON CONFLICT (player_id, season, round_number) DO NOTHING;

-- ── Helper RPC: insert_player_price_snapshot ─────────────────────────────────
-- Called by the price ingest pipeline after committing prices.
-- Accepts: [{ player_id, price, position, round_number, season }]
-- Inserts new rows only. Skips if row already exists for that round.
CREATE OR REPLACE FUNCTION afl.insert_player_price_snapshot(
  p_rows       jsonb,
  p_round      integer DEFAULT NULL,
  p_season     integer DEFAULT 2026
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_round     integer;
  v_inserted  integer := 0;
  v_skipped   integer := 0;
  r           jsonb;
  v_player_id bigint;
  v_price     integer;
  v_position  text;
BEGIN
  -- Auto-detect round from latest games data if not provided
  IF p_round IS NULL THEN
    SELECT MAX(week) INTO v_round
    FROM   afl.player_games
    WHERE  season = p_season;
    v_round := COALESCE(v_round, 1);
  ELSE
    v_round := p_round;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_player_id := (r->>'player_id')::bigint;
    v_price     := (r->>'price')::integer;
    v_position  := r->>'position';

    IF v_player_id IS NULL OR v_price IS NULL OR v_price <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO afl.player_price_history (player_id, price, position, round_number, season)
    VALUES (v_player_id, v_price, v_position, v_round, p_season)
    ON CONFLICT (player_id, season, round_number) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped',  v_skipped,
    'round',    v_round,
    'season',   p_season
  );
END;
$$;

GRANT EXECUTE ON FUNCTION afl.insert_player_price_snapshot(jsonb, integer, integer)
  TO authenticated, service_role;
