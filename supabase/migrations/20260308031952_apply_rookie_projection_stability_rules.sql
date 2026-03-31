/*
  # Rookie Projection Stability Fix — v_neeko_player_projection_final

  ## Summary
  Rebuilds afl.v_neeko_player_projection_final to prevent players with
  insufficient data from producing unrealistic projections.

  ## Rules Applied

  ### Rule 1 — Minimum sample size (games_played_last_2_years < 5)
  Uses stabilised projection blend:
    projection_final = (0.7 * baseline_avg_2025) + (0.3 * weighted_recent_avg)
  instead of the standard formula. Anchors thin-data players to their
  historical baseline rather than noisy recent-form spikes.

  ### Rule 2 — Rookie safeguard (career_games = 0)
  career_games = 0 means both games_played_2025 = 0 AND games_played_2026 = 0.
  Forces projection_final to a fixed position-based rookie baseline:
    DEF = 55, MID = 60, RUC = 65, FWD = 58, unknown = 58
  This overrides Rule 1 — rookies with zero games get the floor, not a
  weighted blend.

  ### Rule 3 — One-game spike protection (games_last_10 < 3)
  When fewer than 3 games exist in last-10 window, reduces the
  trend component weight from 0.18 → 0.10 and matchup component
  from 0.50 → 0.25 to prevent a single outlier game from dominating.

  ### Output column contract
  Columns 1–10 preserved exactly (no name/type changes):
  player_id, player_name, team, projection_final, final_projection,
  ceiling_estimate, floor_estimate, trend_3_vs_10, matchup_delta,
  consistency_score

  ## Not Affected
  - Raw stats, v_neeko_player_projection, v_neeko_player_recent_games
  - Any downstream table writes or cron jobs
  - Column names or types
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection_final AS
WITH player_positions AS (
  SELECT DISTINCT ON (players_canonical.player_name)
    players_canonical.player_name,
    CASE
      WHEN players_canonical.position ~~* '%defender%' THEN 'DEF'
      WHEN players_canonical.position ~~* '%mid%'      THEN 'MID'
      WHEN players_canonical.position ~~* '%forward%'  THEN 'FWD'
      WHEN players_canonical.position ~~* '%ruck%'     THEN 'RUC'
      ELSE NULL
    END AS position_group
  FROM afl.players_canonical
  WHERE players_canonical.position IS NOT NULL
  ORDER BY players_canonical.player_name, players_canonical.season DESC
),
base AS (
  SELECT DISTINCT ON (v.player_id)
    v.player_id,
    v.player_name,
    v.team,
    v.opponent,
    v.final_projection,
    v.ceiling_estimate,
    v.floor_estimate,
    v.trend_3_vs_10,
    v.consistency_score,
    v.games_played_2025,
    v.games_played_2026,
    v.baseline_avg_2025,
    v.weighted_recent_avg,
    (v.games_played_2025 + v.games_played_2026) AS games_played_last_2_years
  FROM afl.v_neeko_player_projection v
  WHERE v.final_projection > 0
     OR (v.games_played_2025 = 0 AND v.games_played_2026 = 0)
  ORDER BY v.player_id, v.final_projection DESC
),
with_position AS (
  SELECT
    b.*,
    pp.position_group AS position
  FROM base b
  LEFT JOIN player_positions pp ON pp.player_name = b.player_name
),
games_last_10_counts AS (
  SELECT player_id,
    COUNT(*) FILTER (WHERE row_num <= 10) AS games_in_last_10
  FROM afl.v_neeko_player_recent_games
  GROUP BY player_id
),
with_matchup AS (
  SELECT
    wp.*,
    g10.games_in_last_10,
    round(
      (COALESCE(m.matchup_multiplier, 1.0) - 1.0)
      * wp.final_projection
      * 0.30,
      2
    ) AS matchup_delta_position
  FROM with_position wp
  LEFT JOIN afl.v_position_matchup_multiplier_2025 m
    ON m.opponent_team = wp.opponent AND m.position = wp.position
  LEFT JOIN games_last_10_counts g10 ON g10.player_id = wp.player_id
),
with_position_avg AS (
  SELECT
    wm.*,
    COALESCE(pa.position_avg_points, wm.final_projection) AS position_avg_points
  FROM with_matchup wm
  LEFT JOIN afl.v_position_fantasy_average_2025 pa ON pa.position = wm.position
),
sample_guard AS (
  SELECT
    wpa.*,
    CASE
      WHEN wpa.games_played_2025 = 0 AND wpa.games_played_2026 = 0
        THEN CASE wpa.position
               WHEN 'DEF' THEN 55.0
               WHEN 'MID' THEN 60.0
               WHEN 'RUC' THEN 65.0
               WHEN 'FWD' THEN 58.0
               ELSE             58.0
             END
      WHEN wpa.games_played_last_2_years < 5
        THEN round(
               (0.7 * COALESCE(wpa.baseline_avg_2025, wpa.final_projection))
               + (0.3 * COALESCE(wpa.weighted_recent_avg, wpa.final_projection)),
               2
             )
      ELSE NULL
    END AS stabilised_projection,
    CASE
      WHEN COALESCE(wpa.games_in_last_10, 0) < 3 THEN 0.10
      ELSE 0.18
    END AS trend_weight,
    CASE
      WHEN COALESCE(wpa.games_in_last_10, 0) < 3 THEN 0.25
      ELSE 0.50
    END AS matchup_weight
  FROM with_position_avg wpa
),
staged AS (
  SELECT
    player_id,
    player_name,
    team,
    opponent,
    final_projection,
    ceiling_estimate,
    floor_estimate,
    trend_3_vs_10,
    consistency_score,
    position,
    position_avg_points,
    matchup_delta_position,
    stabilised_projection,
    games_played_last_2_years,
    games_played_2025,
    games_played_2026,
    round(
      final_projection
      + (trend_3_vs_10 * trend_weight)
      + (matchup_delta_position * matchup_weight)
      + CASE
          WHEN trend_3_vs_10 > 0
          THEN (ceiling_estimate - final_projection) * 0.08
          ELSE 0
        END,
      2
    ) AS projection_raw
  FROM sample_guard
),
regressed AS (
  SELECT
    *,
    round(projection_raw * 0.92 + position_avg_points * 0.08, 2) AS projection_final_intermediate
  FROM staged
),
final_calc AS (
  SELECT
    player_id,
    player_name,
    team,
    final_projection,
    ceiling_estimate,
    floor_estimate,
    trend_3_vs_10,
    matchup_delta_position AS matchup_delta,
    consistency_score,
    CASE
      WHEN stabilised_projection IS NOT NULL
        THEN round(stabilised_projection::numeric, 2)
      ELSE
        round(
          projection_final_intermediate
          * LEAST(GREATEST(1.0 + (consistency_score::numeric - 50.0) / 400.0, 0.875), 1.125),
          2
        )
    END AS projection_final_computed
  FROM regressed
)
SELECT
  player_id,
  player_name,
  team,
  projection_final_computed  AS projection_final,
  round(final_projection, 2) AS final_projection,
  round(ceiling_estimate, 2) AS ceiling_estimate,
  round(floor_estimate, 2)   AS floor_estimate,
  round(trend_3_vs_10, 2)    AS trend_3_vs_10,
  round(matchup_delta, 2)    AS matchup_delta,
  consistency_score
FROM final_calc
WHERE projection_final_computed > 0
ORDER BY projection_final_computed DESC;
