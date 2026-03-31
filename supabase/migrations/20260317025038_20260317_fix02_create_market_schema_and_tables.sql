/*
  # Fix 02: Create market schema and Market Watch tables

  ## Problem
  The market schema does not exist. market.build_market_watch_snapshot() and all
  public.v_mw_* views reference market.market_watch_snapshot,
  market.market_watch_snapshot_players, market.market_watch_best_trades, and
  market.mw_value_history — none of which exist.
  This causes /sports/afl/market-watch to be completely broken for all users.

  ## Solution
  Create the market schema and all 4 required tables.

  ## New Schema
  - market: Container for all Market Watch data

  ## New Tables
  1. market.market_watch_snapshot        — one row per season/round; tracks active snapshot
  2. market.market_watch_snapshot_players — per-player market watch rows per snapshot
  3. market.market_watch_best_trades      — computed trade pairs per snapshot
  4. market.mw_value_history              — rolling value history for momentum calc

  ## Security
  - RLS enabled on all tables
  - SELECT for anon and authenticated (data is non-sensitive analytics)
  - INSERT/UPDATE/DELETE restricted to service_role only
*/

CREATE SCHEMA IF NOT EXISTS market;

-- ── 1. market.market_watch_snapshot ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.market_watch_snapshot (
  snapshot_id   uuid        NOT NULL DEFAULT gen_random_uuid(),
  season        integer     NOT NULL,
  round_number  integer     NOT NULL,
  is_active     boolean     NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_watch_snapshot_pkey PRIMARY KEY (snapshot_id),
  CONSTRAINT market_watch_snapshot_season_round_uniq UNIQUE (season, round_number)
);

ALTER TABLE market.market_watch_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read market_watch_snapshot"
  ON market.market_watch_snapshot FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Service role full market_watch_snapshot"
  ON market.market_watch_snapshot FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ── 2. market.market_watch_snapshot_players ───────────────────────────────────

CREATE TABLE IF NOT EXISTS market.market_watch_snapshot_players (
  id                     bigserial    NOT NULL,
  snapshot_id            uuid         NOT NULL REFERENCES market.market_watch_snapshot(snapshot_id) ON DELETE CASCADE,
  player_id              integer      NOT NULL,
  player_name            text,
  team                   text,
  position               text,
  price                  numeric,
  breakeven              numeric,
  projection             numeric,
  ceiling                numeric,
  risk_pct               numeric,
  price_edge_pts         numeric,
  expected_price_change  numeric,
  projected_price        numeric,
  projected_price_r1     numeric,
  projected_price_r2     numeric,
  projected_price_r3     numeric,
  breakout_score         numeric,
  breakout_flag          boolean      DEFAULT false,
  volatility_score       numeric,
  volatility_level       text,
  category               text,
  action                 text,
  trade_score            numeric,
  reasons                jsonb,
  last3_avg              numeric,
  estimated_price        numeric,
  value_score            numeric,
  price_range_top        numeric,
  price_range_bottom     numeric,
  value_momentum         numeric,
  momentum_label         text,
  peak_price             numeric,
  peak_round             text,
  peak_status            text,
  created_at             timestamptz  DEFAULT now(),
  CONSTRAINT market_watch_snapshot_players_pkey PRIMARY KEY (id)
);

ALTER TABLE market.market_watch_snapshot_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read snapshot_players"
  ON market.market_watch_snapshot_players FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Service role full snapshot_players"
  ON market.market_watch_snapshot_players FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mw_snapshot_players_snapshot
  ON market.market_watch_snapshot_players (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_mw_snapshot_players_category
  ON market.market_watch_snapshot_players (snapshot_id, category);

-- ── 3. market.market_watch_best_trades ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.market_watch_best_trades (
  trade_id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  snapshot_id           uuid        NOT NULL REFERENCES market.market_watch_snapshot(snapshot_id) ON DELETE CASCADE,
  out_player_id         integer     NOT NULL,
  in_player_id          integer     NOT NULL,
  projected_points_gain numeric,
  expected_price_gain   numeric,
  risk_change           numeric,
  confidence            numeric,
  rationale             text,
  created_at            timestamptz DEFAULT now(),
  CONSTRAINT market_watch_best_trades_pkey PRIMARY KEY (trade_id)
);

ALTER TABLE market.market_watch_best_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read best_trades"
  ON market.market_watch_best_trades FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Service role full best_trades"
  ON market.market_watch_best_trades FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mw_best_trades_snapshot
  ON market.market_watch_best_trades (snapshot_id);

-- ── 4. market.mw_value_history ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market.mw_value_history (
  player_id       integer     NOT NULL,
  round_number    integer     NOT NULL,
  season          integer     NOT NULL,
  value_score     numeric,
  estimated_price numeric,
  price           numeric,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT mw_value_history_pkey PRIMARY KEY (player_id, round_number, season)
);

ALTER TABLE market.mw_value_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mw_value_history"
  ON market.mw_value_history FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Service role full mw_value_history"
  ON market.mw_value_history FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA market TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA market TO anon, authenticated;
GRANT ALL    ON ALL TABLES IN SCHEMA market TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA market TO service_role;
