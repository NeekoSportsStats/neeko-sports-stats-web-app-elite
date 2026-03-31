/*
  # Add injury-exit exclusion to projection accuracy views

  ## Purpose
  Prevent extreme outlier performances caused by early-game injuries, concussion
  substitutions, or players leaving the field early from inflating model error.

  ## Exclusion rule
  A record is excluded when BOTH conditions are true:
    actual_score <= projected_score - 50   (extreme underperformance vs expectation)
    AND actual_score <= 40                 (prevents legitimate poor games being excluded)

  Examples:
    Projection 100 → Actual 20  → EXCLUDED  (injury exit)
    Projection 95  → Actual 35  → EXCLUDED  (injury exit)
    Projection 90  → Actual 45  → INCLUDED  (legitimate poor game)
    Projection 85  → Actual 50  → INCLUDED  (legitimate poor game)

  ## Views updated
  - afl.v_projection_accuracy_round   — injury filter added to WHERE clause
  - afl.v_projection_accuracy_season  — injury filter added to WHERE clause
  - afl.v_projection_accuracy_homepage reads from v_projection_accuracy_round,
    so it inherits this fix automatically without modification.

  ## What is NOT changed
  - Raw projection tables/views
  - afl.manual_projection_results table
  - afl.v_projection_accuracy_manual
  - Any other views or tables
  - All output column names and types are preserved exactly
*/

-- v_projection_accuracy_round: add injury exclusion
CREATE OR REPLACE VIEW afl.v_projection_accuracy_round AS
SELECT
    count(*) AS players_analysed,
    avg(abs(p.expected_fantasy - g.fantasy_points::numeric)) AS avg_error,
    (avg(CASE WHEN abs(p.expected_fantasy - g.fantasy_points::numeric) <= 10 THEN 1 ELSE 0 END) * 100) AS within_10,
    (avg(CASE WHEN abs(p.expected_fantasy - g.fantasy_points::numeric) <= 15 THEN 1 ELSE 0 END) * 100) AS within_15,
    (avg(CASE WHEN abs(p.expected_fantasy - g.fantasy_points::numeric) <= 20 THEN 1 ELSE 0 END) * 100) AS within_20
FROM afl.v_player_projection_stats_2026 p
JOIN afl.raw_2026_player_stats g ON lower(p.player) = lower(g.player_name)
WHERE
    g.fantasy_points IS NOT NULL
    AND g.played = true
    -- Injury exclusion: skip extreme outliers likely caused by early-game injuries
    AND NOT (
        g.fantasy_points::numeric <= p.expected_fantasy - 50
        AND g.fantasy_points::numeric <= 40
    );


-- v_projection_accuracy_season: add injury exclusion
CREATE OR REPLACE VIEW afl.v_projection_accuracy_season AS
SELECT
    count(*) AS players,
    avg(abs(p.expected_fantasy - g.fantasy_points::numeric)) AS avg_error,
    (avg(CASE WHEN abs(p.expected_fantasy - g.fantasy_points::numeric) <= 15 THEN 1 ELSE 0 END) * 100) AS within_15,
    (avg(CASE WHEN abs(p.expected_fantasy - g.fantasy_points::numeric) <= 20 THEN 1 ELSE 0 END) * 100) AS within_20
FROM afl.v_player_projection_stats_2026 p
JOIN afl.raw_2026_player_stats g ON lower(p.player) = lower(g.player_name)
WHERE
    g.fantasy_points IS NOT NULL
    AND g.played = true
    -- Injury exclusion: skip extreme outliers likely caused by early-game injuries
    AND NOT (
        g.fantasy_points::numeric <= p.expected_fantasy - 50
        AND g.fantasy_points::numeric <= 40
    );
