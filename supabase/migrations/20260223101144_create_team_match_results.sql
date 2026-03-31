/*
  # Create afl.team_match_results

  One row per team per match (home team row + away team row = 2 rows per match).
  Source: afl.match_scores (just populated above).

  ## New Table: afl.team_match_results
  Columns: team, opponent, match_id, season, round_number, match_date,
           is_home, points_for, points_against, margin, win, loss

  ## Security
  - RLS enabled; authenticated read-only policy
*/

CREATE TABLE IF NOT EXISTS afl.team_match_results (
  id              BIGSERIAL PRIMARY KEY,
  team            TEXT NOT NULL,
  opponent        TEXT NOT NULL,
  match_id        INTEGER NOT NULL,
  season          INTEGER NOT NULL,
  round_number    INTEGER NOT NULL,
  match_date      TIMESTAMP,
  is_home         BOOLEAN NOT NULL,
  points_for      INTEGER,
  points_against  INTEGER,
  margin          INTEGER,
  win             BOOLEAN,
  loss            BOOLEAN,
  created_at      TIMESTAMP DEFAULT now(),
  UNIQUE (match_id, team)
);

CREATE INDEX IF NOT EXISTS idx_team_match_results_team   ON afl.team_match_results (team);
CREATE INDEX IF NOT EXISTS idx_team_match_results_season ON afl.team_match_results (season, round_number);

ALTER TABLE afl.team_match_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'team_match_results' AND policyname = 'Authenticated users can read team match results'
  ) THEN
    CREATE POLICY "Authenticated users can read team match results"
      ON afl.team_match_results FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

INSERT INTO afl.team_match_results (
  team, opponent, match_id, season, round_number, match_date,
  is_home, points_for, points_against, margin, win, loss
)
SELECT
  home_team       AS team,
  away_team       AS opponent,
  match_id,
  season,
  round_number,
  match_date,
  true            AS is_home,
  home_score      AS points_for,
  away_score      AS points_against,
  margin          AS margin,
  home_win        AS win,
  NOT home_win    AS loss
FROM afl.match_scores

UNION ALL

SELECT
  away_team       AS team,
  home_team       AS opponent,
  match_id,
  season,
  round_number,
  match_date,
  false           AS is_home,
  away_score      AS points_for,
  home_score      AS points_against,
  -(margin)       AS margin,
  NOT home_win    AS win,
  home_win        AS loss
FROM afl.match_scores

ON CONFLICT (match_id, team) DO NOTHING;
