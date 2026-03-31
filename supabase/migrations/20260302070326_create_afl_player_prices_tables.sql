/*
  # Create AFL Player Prices Tables

  1. New Tables
    - `afl_player_prices_import` — staging table for raw CSV data
      - player_name (text)
      - position (text)
      - price_raw (text) — original price string with $ and commas
      - avg_2025 (numeric)
      - games_2025 (integer)
      - priced_at (numeric)

    - `afl_player_prices` — canonical prices table
      - id (uuid, pk)
      - player_id (bigint, nullable, FK resolved via v_rankings_master)
      - player_name (text)
      - position (text)
      - price (integer) — cleaned integer price
      - avg_2025 (numeric)
      - games_2025 (integer)
      - priced_at (numeric)
      - season (integer)
      - round_number (integer)
      - created_at (timestamptz)

  2. Security
    - RLS enabled on both tables
    - Read access for authenticated users on afl_player_prices
    - No public write access

  3. Notes
    - price_raw is preserved for audit purposes
    - Invalid rows (non-numeric price) are excluded on insert
*/

CREATE TABLE IF NOT EXISTS afl_player_prices_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  position text,
  price_raw text,
  avg_2025 numeric,
  games_2025 integer,
  priced_at numeric,
  imported_at timestamptz DEFAULT now()
);

ALTER TABLE afl_player_prices_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read price import"
  ON afl_player_prices_import FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS afl_player_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id bigint,
  player_name text NOT NULL,
  position text,
  price integer NOT NULL,
  avg_2025 numeric,
  games_2025 integer,
  priced_at numeric,
  season integer NOT NULL DEFAULT 2026,
  round_number integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE afl_player_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read player prices"
  ON afl_player_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS afl_player_prices_player_season_round_uq
  ON afl_player_prices (player_name, season, round_number);
