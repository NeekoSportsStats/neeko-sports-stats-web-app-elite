/*
  # Fix Projection Accuracy Views — Correct Join Pattern

  ## Problem
  The existing accuracy views joined projections to actuals via:
    - `afl.v_player_projection_stats_2026` JOIN `afl.raw_2026_player_stats` on lower(player_name)
  But `raw_2026_player_stats` had no time_on_ground data for 2026 round 0, and the
  injury exclusion filter (`time_on_ground < 40`) was silently dropping all rows.

  ## Fix
  1. Source actuals from `afl.raw_2026_player_stats` (has player_id + proper player_name)
  2. Join to `afl.v_player_projection_stats_2026` on lower(player_name) — 2025-baseline projections
  3. Exclude anonymised Player#ID names (incomplete ingestion artefacts)
  4. Exclude fantasy_points = 0 as the injury/DNP proxy (TOG not yet populated for 2026)
  5. Require expected_fantasy IS NOT NULL
  6. Use round_number from actuals for per-round breakdown

  ## Views Rebuilt
  - afl.v_projection_accuracy_season — season-level summary
  - afl.v_projection_accuracy_round — current round summary (matches homepage)
  - afl.v_projection_accuracy_by_round — per-round breakdown
*/

-- Season-level accuracy summary
CREATE OR REPLACE VIEW afl.v_projection_accuracy_season
WITH (security_invoker = true)
AS
SELECT
  COUNT(*)                                                              AS players,
  ROUND(AVG(ABS(p.expected_fantasy - g.fantasy_points)), 2)           AS avg_error,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 15)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_15,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 20)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_20
FROM afl.raw_2026_player_stats g
JOIN afl.v_player_projection_stats_2026 p
  ON lower(p.player) = lower(g.player_name)
WHERE g.played = true
  AND g.fantasy_points IS NOT NULL
  AND g.fantasy_points > 0
  AND p.expected_fantasy IS NOT NULL
  AND g.player_name NOT LIKE 'Player#%';

-- Round-level accuracy summary (for homepage / model validation page)
CREATE OR REPLACE VIEW afl.v_projection_accuracy_round
WITH (security_invoker = true)
AS
SELECT
  COUNT(*)                                                              AS players_analysed,
  ROUND(AVG(ABS(p.expected_fantasy - g.fantasy_points)), 2)           AS avg_error,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 10)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_10,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 15)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_15,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 20)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_20
FROM afl.raw_2026_player_stats g
JOIN afl.v_player_projection_stats_2026 p
  ON lower(p.player) = lower(g.player_name)
WHERE g.played = true
  AND g.fantasy_points IS NOT NULL
  AND g.fantasy_points > 0
  AND p.expected_fantasy IS NOT NULL
  AND g.player_name NOT LIKE 'Player#%';

-- Per-round breakdown
CREATE OR REPLACE VIEW afl.v_projection_accuracy_by_round
WITH (security_invoker = true)
AS
SELECT
  g.round_number,
  COUNT(*)                                                              AS players,
  ROUND(AVG(ABS(p.expected_fantasy - g.fantasy_points)), 2)           AS avg_error,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 15)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_15,
  ROUND(
    COUNT(*) FILTER (WHERE ABS(p.expected_fantasy - g.fantasy_points) <= 20)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1)                                   AS within_20
FROM afl.raw_2026_player_stats g
JOIN afl.v_player_projection_stats_2026 p
  ON lower(p.player) = lower(g.player_name)
WHERE g.played = true
  AND g.fantasy_points IS NOT NULL
  AND g.fantasy_points > 0
  AND p.expected_fantasy IS NOT NULL
  AND g.player_name NOT LIKE 'Player#%'
GROUP BY g.round_number
ORDER BY g.round_number;

-- Grant read access
GRANT SELECT ON afl.v_projection_accuracy_season   TO anon, authenticated;
GRANT SELECT ON afl.v_projection_accuracy_round    TO anon, authenticated;
GRANT SELECT ON afl.v_projection_accuracy_by_round TO anon, authenticated;
