/*
  # Create match quarter scores table and summary view

  1. New Tables
    - `afl.match_quarter_scores`
      - `id` (uuid, primary key)
      - `match_id` (uuid, FK to afl.matches)
      - `quarter` (integer, 1-4)
      - `home_goals` (integer, default 0)
      - `home_behinds` (integer, default 0)
      - `away_goals` (integer, default 0)
      - `away_behinds` (integer, default 0)
      - `created_at` (timestamptz)
    - Unique constraint on (match_id, quarter)

  2. New Views
    - `afl.v_match_quarter_summary_2025`
      - Joins quarter scores with matches for 2025 season
      - Computes home_points and away_points from goals/behinds

  3. Security
    - Enable RLS on match_quarter_scores
    - Read-only policy for authenticated users
*/

CREATE TABLE IF NOT EXISTS afl.match_quarter_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES afl.matches(id),
  quarter integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  home_goals integer NOT NULL DEFAULT 0,
  home_behinds integer NOT NULL DEFAULT 0,
  away_goals integer NOT NULL DEFAULT 0,
  away_behinds integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (match_id, quarter)
);

ALTER TABLE afl.match_quarter_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quarter scores"
  ON afl.match_quarter_scores
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_match_quarter_scores_match_id
  ON afl.match_quarter_scores(match_id);

CREATE OR REPLACE VIEW afl.v_match_quarter_summary_2025 AS
SELECT
  qs.match_id,
  m.season,
  m.round_number,
  qs.quarter,
  qs.home_goals,
  qs.home_behinds,
  (qs.home_goals * 6 + qs.home_behinds) AS home_points,
  qs.away_goals,
  qs.away_behinds,
  (qs.away_goals * 6 + qs.away_behinds) AS away_points
FROM afl.match_quarter_scores qs
JOIN afl.matches m ON m.id = qs.match_id
WHERE m.season = 2025
ORDER BY qs.match_id, qs.quarter;
