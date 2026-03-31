/*
  # Create AFL Matches Table
  
  Creates the matches/fixtures table for AFL Match Centre with real 2025 season data.
  
  1. New Table
    - `afl.matches` - Stores match fixtures with teams, venue, timing, and scores
    
  2. Columns
    - id: UUID primary key
    - season: Season year (2025)
    - round_number: Round number (1-24)
    - match_index: Match index for double-header rounds (default 1)
    - home_team_id: Foreign key to afl.teams
    - away_team_id: Foreign key to afl.teams
    - venue: Match venue name
    - match_date: Date of the match
    - match_time: Time of the match
    - status: Match status (upcoming, live, final)
    - home_score: Home team final score (nullable)
    - away_score: Away team final score (nullable)
    
  3. Security
    - Enable RLS
    - Public read access for all users
*/

CREATE TABLE IF NOT EXISTS afl.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  round_number integer NOT NULL CHECK (round_number >= 1 AND round_number <= 28),
  match_index integer NOT NULL DEFAULT 1,
  home_team_id uuid NOT NULL REFERENCES afl.teams(id),
  away_team_id uuid NOT NULL REFERENCES afl.teams(id),
  venue text NOT NULL,
  match_date date NOT NULL,
  match_time time,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'final')),
  home_score integer,
  away_score integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(season, round_number, match_index, home_team_id, away_team_id)
);

ALTER TABLE afl.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matches are viewable by everyone"
  ON afl.matches
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_matches_season_round ON afl.matches(season, round_number, match_index);
CREATE INDEX IF NOT EXISTS idx_matches_status ON afl.matches(status);
