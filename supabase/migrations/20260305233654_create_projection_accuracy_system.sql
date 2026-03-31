/*
  # Projection Accuracy System

  ## Overview
  Full accuracy tracking system for Neeko player projections.
  Supports manual entry for early rounds and automatic calculation once raw stats exist.

  ## New Tables
  - `afl.manual_projection_results` — manual score entry for early rounds before API pipeline runs
  - `afl.model_accuracy_history` — historical accuracy records for marketing credibility

  ## New Views
  - `afl.v_projection_accuracy_manual` — accuracy from manually entered scores
  - `afl.v_projection_accuracy_round` — accuracy vs actual raw stats (latest round)
  - `afl.v_projection_accuracy_by_round` — per-round accuracy breakdown
  - `afl.v_projection_accuracy_season` — full season accuracy
  - `afl.v_projection_accuracy_homepage` — smart view: manual until API data exists, then auto

  ## Notes
  - SAFE MODE: no existing tables or views modified
  - Joins use LOWER() normalisation for player name matching
  - `raw_2026_player_stats` is the actual scores source (has player_name, round_number, fantasy_points)
  - `v_player_projection_stats_2026` is the projections source (has player, expected_fantasy)
*/

-- ============================================================
-- STEP 1: Manual projection results table
-- ============================================================

CREATE TABLE IF NOT EXISTS afl.manual_projection_results (
  id            BIGSERIAL PRIMARY KEY,
  player        TEXT        NOT NULL,
  team          TEXT,
  projected_score NUMERIC,
  actual_score    NUMERIC,
  match_label   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE afl.manual_projection_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage manual projection results"
  ON afl.manual_projection_results
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- STEP 2: Manual accuracy view
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_accuracy_manual
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                              AS players_analysed,
  AVG(ABS(projected_score - actual_score))                             AS avg_error,
  AVG(CASE WHEN ABS(projected_score - actual_score) <= 10 THEN 1 ELSE 0 END) * 100 AS within_10,
  AVG(CASE WHEN ABS(projected_score - actual_score) <= 15 THEN 1 ELSE 0 END) * 100 AS within_15,
  AVG(CASE WHEN ABS(projected_score - actual_score) <= 20 THEN 1 ELSE 0 END) * 100 AS within_20
FROM afl.manual_projection_results
WHERE projected_score IS NOT NULL
  AND actual_score    IS NOT NULL;

GRANT SELECT ON afl.v_projection_accuracy_manual TO anon, authenticated;

-- ============================================================
-- STEP 3: Automatic accuracy view (latest available round)
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_accuracy_round
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                                              AS players_analysed,
  AVG(ABS(p.expected_fantasy - g.fantasy_points))                                      AS avg_error,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 10 THEN 1 ELSE 0 END) * 100 AS within_10,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 15 THEN 1 ELSE 0 END) * 100 AS within_15,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 20 THEN 1 ELSE 0 END) * 100 AS within_20
FROM afl.v_player_projection_stats_2026 p
JOIN afl.raw_2026_player_stats g
  ON LOWER(p.player) = LOWER(g.player_name)
WHERE g.fantasy_points IS NOT NULL
  AND g.played = true;

GRANT SELECT ON afl.v_projection_accuracy_round TO anon, authenticated;

-- ============================================================
-- STEP 4: Round-by-round accuracy history
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_accuracy_by_round
WITH (security_invoker = false)
AS
SELECT
  g.round_number,
  COUNT(*)                                                                              AS players,
  AVG(ABS(p.expected_fantasy - g.fantasy_points))                                      AS avg_error,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 15 THEN 1 ELSE 0 END) * 100 AS within_15,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 20 THEN 1 ELSE 0 END) * 100 AS within_20
FROM afl.v_player_projection_stats_2026 p
JOIN afl.raw_2026_player_stats g
  ON LOWER(p.player) = LOWER(g.player_name)
WHERE g.fantasy_points IS NOT NULL
  AND g.played = true
GROUP BY g.round_number
ORDER BY g.round_number;

GRANT SELECT ON afl.v_projection_accuracy_by_round TO anon, authenticated;

-- ============================================================
-- STEP 5: Season accuracy view
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_accuracy_season
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                                              AS players,
  AVG(ABS(p.expected_fantasy - g.fantasy_points))                                      AS avg_error,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 15 THEN 1 ELSE 0 END) * 100 AS within_15,
  AVG(CASE WHEN ABS(p.expected_fantasy - g.fantasy_points) <= 20 THEN 1 ELSE 0 END) * 100 AS within_20
FROM afl.v_player_projection_stats_2026 p
JOIN afl.raw_2026_player_stats g
  ON LOWER(p.player) = LOWER(g.player_name)
WHERE g.fantasy_points IS NOT NULL
  AND g.played = true;

GRANT SELECT ON afl.v_projection_accuracy_season TO anon, authenticated;

-- ============================================================
-- STEP 6: Homepage smart view
-- Uses auto accuracy if data exists, falls back to manual
-- Columns: players_analysed, avg_error, within_10, within_15, within_20
-- ============================================================

CREATE OR REPLACE VIEW afl.v_projection_accuracy_homepage
WITH (security_invoker = false)
AS
SELECT
  players_analysed,
  avg_error,
  within_10,
  within_15,
  within_20,
  'auto' AS source
FROM afl.v_projection_accuracy_round
WHERE players_analysed > 0

UNION ALL

SELECT
  players_analysed,
  avg_error,
  within_10,
  within_15,
  within_20,
  'manual' AS source
FROM afl.v_projection_accuracy_manual
WHERE players_analysed > 0

LIMIT 1;

GRANT SELECT ON afl.v_projection_accuracy_homepage TO anon, authenticated;

-- ============================================================
-- STEP 7: Historical model accuracy table
-- ============================================================

CREATE TABLE IF NOT EXISTS afl.model_accuracy_history (
  id               BIGSERIAL PRIMARY KEY,
  players_analysed INT,
  avg_error        NUMERIC,
  within_10        NUMERIC,
  within_15        NUMERIC,
  within_20        NUMERIC,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE afl.model_accuracy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read model accuracy history"
  ON afl.model_accuracy_history
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- STEP 8: Insert historical accuracy record
-- ============================================================

INSERT INTO afl.model_accuracy_history
  (players_analysed, avg_error, within_10, within_15, within_20, notes)
VALUES
  (9866, 16.03, 38.78, 55.45, 68.70, 'Neeko historical projection dataset');
