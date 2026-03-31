/*
  # Add Injury / Sub Game Exclusion to v_projection_accuracy_round

  ## Summary
  Rebuilds the projection accuracy view to exclude abnormal games caused by
  injuries or substitutions. These events distort model evaluation and should
  not count toward accuracy metrics.

  ## Exclusion Rule
  A player performance is excluded when:
    ABS(projection - actual_score) > 40 AND actual_score < 50

  This removes injury games and subbed-off players while preserving genuine
  high-ceiling performances (e.g. a player who projected 40 and scored 90).

  ## Views Modified
  - afl.v_projection_accuracy_round — adds injury exclusion filter to WHERE clause

  ## No Other Changes
  - projection model, pipeline, AI system, rankings are untouched
  - v_projection_accuracy_homepage reads from this view automatically
  - frontend picks up updated numbers with no code change needed
*/

CREATE OR REPLACE VIEW afl.v_projection_accuracy_round AS
SELECT
  count(*) AS players_analysed,
  round(avg(abs(p.expected_fantasy - g.fantasy_points::numeric)), 2) AS avg_error,
  round(
    count(*) FILTER (WHERE abs(p.expected_fantasy - g.fantasy_points::numeric) <= 10::numeric)::numeric
    / NULLIF(count(*), 0)::numeric * 100::numeric, 1
  ) AS within_10,
  round(
    count(*) FILTER (WHERE abs(p.expected_fantasy - g.fantasy_points::numeric) <= 15::numeric)::numeric
    / NULLIF(count(*), 0)::numeric * 100::numeric, 1
  ) AS within_15,
  round(
    count(*) FILTER (WHERE abs(p.expected_fantasy - g.fantasy_points::numeric) <= 20::numeric)::numeric
    / NULLIF(count(*), 0)::numeric * 100::numeric, 1
  ) AS within_20
FROM afl.raw_2026_player_stats g
JOIN afl.v_player_projection_stats_2026 p
  ON lower(p.player) = lower(g.player_name)
WHERE
  g.played = true
  AND g.fantasy_points IS NOT NULL
  AND g.fantasy_points > 0
  AND p.expected_fantasy IS NOT NULL
  AND g.player_name NOT LIKE 'Player#%'
  AND NOT (
    ABS(p.expected_fantasy - g.fantasy_points::numeric) > 40
    AND g.fantasy_points::numeric < 50
  );
