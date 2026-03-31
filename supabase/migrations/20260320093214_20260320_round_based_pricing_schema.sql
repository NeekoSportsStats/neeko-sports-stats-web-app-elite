/*
  # Round-Based Fantasy Price System — Schema Foundation

  ## Summary
  Upgrades the fantasy pricing system to support per-round historical price data
  with a locking mechanism to prevent accidental overwrites.

  ## New Tables
  - `afl.price_rounds` — metadata for each price round (season/round/label/lock status)

  ## Modified Tables
  - `afl.player_prices` — adds season, round, is_locked columns with composite PK
    (existing single-row-per-player data is preserved as round=0, season=2026)

  ## Security
  - RLS enabled on price_rounds
  - Admin-only write access, authenticated read access

  ## Notes
  - player_price_history already has round_number/season — it remains the canonical
    time-series store; player_prices is the "current round" fast-lookup table
  - is_locked on player_prices rows mirrors the price_rounds lock state for query efficiency
*/

-- ─── 1. price_rounds metadata table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.price_rounds (
  season      INTEGER      NOT NULL,
  round       INTEGER      NOT NULL,
  label       TEXT         NOT NULL DEFAULT '',
  is_locked   BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (season, round)
);

ALTER TABLE afl.price_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage price rounds"
  ON afl.price_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admin can update price rounds"
  ON afl.price_rounds
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admin can delete price rounds"
  ON afl.price_rounds
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Authenticated users can read price rounds"
  ON afl.price_rounds
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── 2. Extend afl.player_prices with round/season/lock columns ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_prices' AND column_name = 'season'
  ) THEN
    ALTER TABLE afl.player_prices ADD COLUMN season INTEGER NOT NULL DEFAULT 2026;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_prices' AND column_name = 'round'
  ) THEN
    ALTER TABLE afl.player_prices ADD COLUMN round INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_prices' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE afl.player_prices ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_prices' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE afl.player_prices ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- Drop old unique constraint if it exists before adding new composite one
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_prices_player_id_key' AND conrelid = 'afl.player_prices'::regclass
  ) THEN
    ALTER TABLE afl.player_prices DROP CONSTRAINT player_prices_player_id_key;
  END IF;
END $$;

-- Add composite unique index for (player_id, season, round)
CREATE UNIQUE INDEX IF NOT EXISTS player_prices_player_season_round_uq
  ON afl.player_prices (player_id, season, round);

-- Ensure RLS is on
ALTER TABLE afl.player_prices ENABLE ROW LEVEL SECURITY;

-- Service role policy for pipeline writes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'player_prices' AND policyname = 'Service role full access player_prices'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role full access player_prices"
      ON afl.player_prices
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)';
  END IF;
END $$;

-- ─── 3. Seed the Opening Round (round=0) row in price_rounds if it doesn't exist
INSERT INTO afl.price_rounds (season, round, label, is_locked)
VALUES (2026, 0, 'Opening Round', false)
ON CONFLICT (season, round) DO NOTHING;

-- ─── 4. Public wrapper: get price rounds ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_price_rounds(p_season INTEGER DEFAULT 2026)
RETURNS TABLE (
  season      INTEGER,
  round       INTEGER,
  label       TEXT,
  is_locked   BOOLEAN,
  created_at  TIMESTAMPTZ,
  player_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = afl, public
AS $$
  SELECT
    pr.season,
    pr.round,
    pr.label,
    pr.is_locked,
    pr.created_at,
    COUNT(pp.player_id) AS player_count
  FROM afl.price_rounds pr
  LEFT JOIN afl.player_prices pp
    ON pp.season = pr.season AND pp.round = pr.round
  WHERE pr.season = p_season
  GROUP BY pr.season, pr.round, pr.label, pr.is_locked, pr.created_at
  ORDER BY pr.round ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_price_rounds TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_rounds TO anon;
