/*
  # Create afl.match_scores

  Source: afl.games_base (216 completed 2025 matches, scores already parsed)
  No raw JSON extraction required — all score columns are already present.

  ## New Table: afl.match_scores
  - One row per completed match
  - Columns: match_id, season, round_number, match_date, home/away team, goals,
    behinds, score, margin, winner, home_win
  - INSERT ... ON CONFLICT DO NOTHING for safe re-runs

  ## Security
  - RLS enabled; authenticated read-only policy
*/

CREATE TABLE IF NOT EXISTS afl.match_scores (
  match_id        INTEGER PRIMARY KEY,
  season          INTEGER NOT NULL,
  round_number    INTEGER NOT NULL,
  match_date      TIMESTAMP,
  home_team       TEXT NOT NULL,
  away_team       TEXT NOT NULL,
  home_goals      INTEGER,
  home_behinds    INTEGER,
  home_score      INTEGER,
  away_goals      INTEGER,
  away_behinds    INTEGER,
  away_score      INTEGER,
  margin          INTEGER,
  winner          TEXT,
  home_win        BOOLEAN,
  created_at      TIMESTAMP DEFAULT now()
);

ALTER TABLE afl.match_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'match_scores' AND policyname = 'Authenticated users can read match scores'
  ) THEN
    CREATE POLICY "Authenticated users can read match scores"
      ON afl.match_scores FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

INSERT INTO afl.match_scores (
  match_id, season, round_number, match_date,
  home_team, away_team,
  home_goals, home_behinds, home_score,
  away_goals, away_behinds, away_score,
  margin, winner, home_win
)
SELECT
  vendor_game_id                          AS match_id,
  season,
  round_number,
  game_time_utc::timestamp               AS match_date,
  home_team,
  away_team,
  home_goals,
  home_behinds,
  home_score,
  away_goals,
  away_behinds,
  away_score,
  (home_score - away_score)              AS margin,
  CASE
    WHEN home_score > away_score THEN home_team
    WHEN away_score > home_score THEN away_team
    ELSE 'Draw'
  END                                    AS winner,
  home_score > away_score                AS home_win
FROM afl.games_base
WHERE status = 'FT'
  AND home_score IS NOT NULL
  AND away_score IS NOT NULL
ON CONFLICT (match_id) DO NOTHING;
