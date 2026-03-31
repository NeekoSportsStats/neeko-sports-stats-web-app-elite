
/*
  # Market Watch V2 Schema

  Creates the `market` schema and all required tables and views for Market Watch V2.

  1. New Schema
    - `market`

  2. New Tables
    - `market.market_watch_snapshot` — one row per season/round combination
    - `market.market_watch_snapshot_players` — player data per snapshot
    - `market.market_watch_best_trades` — computed best trade pairs per snapshot

  3. New Views
    - `market.v_mw_premium` — all player data from latest snapshots
    - `market.v_mw_best_trades` — best trade pairs
    - `market.v_mw_summary_cards` — aggregate summary stats

  4. Security
    - RLS enabled on all tables
    - Authenticated users can read snapshot and player data
    - Service role has full access
*/

-- ── STEP 1: Schema ────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS market;

-- ── STEP 2: Snapshot table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.market_watch_snapshot (
  snapshot_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season        integer     NOT NULL,
  round_number  integer     NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  is_active     boolean     DEFAULT true,
  UNIQUE (season, round_number)
);

ALTER TABLE market.market_watch_snapshot ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'market' AND tablename = 'market_watch_snapshot' AND policyname = 'Authenticated users can read snapshots'
  ) THEN
    CREATE POLICY "Authenticated users can read snapshots"
      ON market.market_watch_snapshot
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ── STEP 3: Snapshot players ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.market_watch_snapshot_players (
  snapshot_id           uuid        REFERENCES market.market_watch_snapshot(snapshot_id) ON DELETE CASCADE,
  player_id             integer     NOT NULL,
  player_name           text,
  team                  text,
  position              text,
  price                 integer,
  breakeven             numeric,
  projection            numeric,
  ceiling               numeric,
  risk_pct              numeric,
  price_edge_pts        numeric,
  expected_price_change numeric,
  category              text,
  action                text,
  trade_score           numeric,
  reasons               jsonb,
  created_at            timestamptz DEFAULT now(),
  PRIMARY KEY (snapshot_id, player_id)
);

ALTER TABLE market.market_watch_snapshot_players ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'market' AND tablename = 'market_watch_snapshot_players' AND policyname = 'Authenticated users can read snapshot players'
  ) THEN
    CREATE POLICY "Authenticated users can read snapshot players"
      ON market.market_watch_snapshot_players
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ── STEP 4: Best trades ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.market_watch_best_trades (
  trade_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id           uuid        REFERENCES market.market_watch_snapshot(snapshot_id) ON DELETE CASCADE,
  out_player_id         integer,
  in_player_id          integer,
  projected_points_gain numeric,
  expected_price_gain   numeric,
  risk_change           numeric,
  confidence            numeric,
  rationale             text,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE market.market_watch_best_trades ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'market' AND tablename = 'market_watch_best_trades' AND policyname = 'Authenticated users can read best trades'
  ) THEN
    CREATE POLICY "Authenticated users can read best trades"
      ON market.market_watch_best_trades
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ── STEP 5: Premium view ──────────────────────────────────────────────────────

CREATE OR REPLACE VIEW market.v_mw_premium AS
SELECT
  snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection,
  ceiling,
  risk_pct,
  price_edge_pts,
  expected_price_change,
  category,
  action,
  trade_score,
  reasons
FROM market.market_watch_snapshot_players;

-- ── STEP 6: Best trades view ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW market.v_mw_best_trades AS
SELECT
  trade_id,
  snapshot_id,
  out_player_id,
  in_player_id,
  projected_points_gain,
  expected_price_gain,
  risk_change,
  confidence,
  rationale
FROM market.market_watch_best_trades;

-- ── STEP 7: Summary cards view ────────────────────────────────────────────────

CREATE OR REPLACE VIEW market.v_mw_summary_cards AS
SELECT
  MAX(expected_price_change) AS best_cash_cow,
  MAX(trade_score)           AS best_trade_score,
  MIN(price_edge_pts)        AS biggest_trap
FROM market.market_watch_snapshot_players;

-- ── STEP 8: Grants ────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA market TO authenticated, service_role;

GRANT SELECT ON market.market_watch_snapshot         TO authenticated, service_role;
GRANT SELECT ON market.market_watch_snapshot_players TO authenticated, service_role;
GRANT SELECT ON market.market_watch_best_trades      TO authenticated, service_role;
GRANT SELECT ON market.v_mw_premium                  TO authenticated, service_role;
GRANT SELECT ON market.v_mw_best_trades              TO authenticated, service_role;
GRANT SELECT ON market.v_mw_summary_cards            TO authenticated, service_role;

GRANT ALL ON market.market_watch_snapshot             TO service_role;
GRANT ALL ON market.market_watch_snapshot_players     TO service_role;
GRANT ALL ON market.market_watch_best_trades          TO service_role;
