/*
  # Market Watch Value History Table

  ## Summary
  Creates a historical log of player value scores, estimated prices, and current
  prices — one row per player per round. Used by the momentum engine to calculate
  week-on-week value changes.

  ## New Table
  - `market.mw_value_history`
    - `id`              (bigserial, primary key)
    - `player_id`       (integer, not null)
    - `round_number`    (integer, not null)
    - `season`          (integer, not null, default 2026)
    - `value_score`     (numeric) — estimated_price - price at time of snapshot
    - `estimated_price` (numeric) — last3_avg * 7200 at time of snapshot
    - `price`           (integer) — actual player price at time of snapshot
    - `created_at`      (timestamptz, default now())
    - UNIQUE (player_id, round_number, season) — one row per player per round

  ## Security
  - RLS enabled
  - Authenticated users can read history
  - Service role has full access (for write operations from snapshot function)

  ## Notes
  - Indexed on (player_id, round_number DESC) for fast momentum lookups
*/

CREATE TABLE IF NOT EXISTS market.mw_value_history (
  id              bigserial       PRIMARY KEY,
  player_id       integer         NOT NULL,
  round_number    integer         NOT NULL,
  season          integer         NOT NULL DEFAULT 2026,
  value_score     numeric,
  estimated_price numeric,
  price           integer,
  created_at      timestamptz     DEFAULT now(),
  UNIQUE (player_id, round_number, season)
);

ALTER TABLE market.mw_value_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'market'
      AND tablename  = 'mw_value_history'
      AND policyname = 'Authenticated users can read value history'
  ) THEN
    CREATE POLICY "Authenticated users can read value history"
      ON market.mw_value_history
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mw_value_history_player_round
  ON market.mw_value_history (player_id, round_number DESC);

CREATE INDEX IF NOT EXISTS idx_mw_value_history_season_round
  ON market.mw_value_history (season, round_number DESC);

GRANT SELECT ON market.mw_value_history TO authenticated;
GRANT ALL    ON market.mw_value_history TO service_role;
GRANT USAGE  ON SEQUENCE market.mw_value_history_id_seq TO service_role;
