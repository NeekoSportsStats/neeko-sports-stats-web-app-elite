/*
  # AFL Player Ledger Schema

  1. Schema Creation
    - Create `afl` schema for AFL-specific data

  2. New Tables
    - `afl.teams`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `abbreviation` (text)
      - `color` (text) - hex color for UI
      - `created_at` (timestamptz)
    
    - `afl.players`
      - `id` (uuid, primary key)
      - `name` (text)
      - `team_id` (uuid, references teams)
      - `role` (text) - MID, FWD, DEF, RUC
      - `created_at` (timestamptz)
    
    - `afl.round_player_summary`
      - `id` (uuid, primary key)
      - `season` (integer) - e.g., 2025
      - `round_number` (integer) - 1-28
      - `player_id` (uuid, references players)
      - `team_id` (uuid, references teams)
      - `disposals` (integer)
      - `goals` (integer)
      - `fantasy_points` (integer)
      - `played` (boolean) - false if bye/injured
      - `created_at` (timestamptz)
      - Unique constraint on (season, round_number, player_id)

  3. Security
    - Enable RLS on all tables
    - Public read access (anyone can view stats)
    - Only authenticated admins can modify

  4. Indexes
    - Index on season + round_number for fast queries
    - Index on player_id for player lookups
*/

-- Create afl schema
CREATE SCHEMA IF NOT EXISTS afl;

-- Teams table
CREATE TABLE IF NOT EXISTS afl.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  abbreviation text NOT NULL,
  color text NOT NULL DEFAULT '#666666',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE afl.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view teams"
  ON afl.teams FOR SELECT
  TO authenticated, anon
  USING (true);

-- Players table
CREATE TABLE IF NOT EXISTS afl.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_id uuid REFERENCES afl.teams(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('MID', 'FWD', 'DEF', 'RUC')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE afl.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view players"
  ON afl.players FOR SELECT
  TO authenticated, anon
  USING (true);

-- Round player summary table
CREATE TABLE IF NOT EXISTS afl.round_player_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  round_number integer NOT NULL CHECK (round_number >= 1 AND round_number <= 28),
  player_id uuid NOT NULL REFERENCES afl.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES afl.teams(id) ON DELETE CASCADE,
  disposals integer DEFAULT 0,
  goals integer DEFAULT 0,
  fantasy_points integer DEFAULT 0,
  played boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(season, round_number, player_id)
);

ALTER TABLE afl.round_player_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view round player summary"
  ON afl.round_player_summary FOR SELECT
  TO authenticated, anon
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_round_player_summary_season_round 
  ON afl.round_player_summary(season, round_number);

CREATE INDEX IF NOT EXISTS idx_round_player_summary_player 
  ON afl.round_player_summary(player_id);

CREATE INDEX IF NOT EXISTS idx_round_player_summary_season_player 
  ON afl.round_player_summary(season, player_id);