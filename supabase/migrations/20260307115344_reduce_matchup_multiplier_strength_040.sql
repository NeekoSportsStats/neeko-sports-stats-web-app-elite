/*
  # Reduce Matchup Multiplier Strength in v_neeko_player_projection_final

  ## Summary
  Caps the matchup multiplier influence so opponent adjustments cannot
  cause extreme projection inflation.

  ## Change
  Previously the matchup delta was built in two stages:
    1. with_matchup:  (multiplier - 1.0) * baseline * 0.30
    2. staged:        + matchup_delta_position * 0.50
    Effective influence: (multiplier - 1) * 0.15 of baseline

  New formula consolidates this into a single explicit cap:
    with_matchup:  (multiplier - 1.0) * baseline * 0.40
    staged:        + matchup_delta_position * 1.0  (pass-through)
    Effective influence: (multiplier - 1) * 0.40 of baseline

  Example:
    Old: 1.15 multiplier → +15% raw, then 0.15 effective = +2.25%
    New: 1.15 multiplier → (0.15 * 0.40) = +6% direct

  ## Not Affected
  - projection baseline (final_projection from upstream view)
  - rolling averages
  - trend weighting (trend_3_vs_10 * 0.18)
  - consistency model
  - dampening coefficients (0.92 / 0.08)
  - Column names: projection_final, matchup_delta
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection_final AS
WITH player_positions AS (
  SELECT DISTINCT ON (players_canonical.player_name)
    players_canonical.player_name,
    CASE
      WHEN players_canonical."position" ~~* '%defender%' THEN 'DEF'
      WHEN players_canonical."position" ~~* '%mid%'      THEN 'MID'
      WHEN players_canonical."position" ~~* '%forward%'  THEN 'FWD'
      WHEN players_canonical."position" ~~* '%ruck%'     THEN 'RUC'
      ELSE NULL
    END AS position_group
  FROM afl.players_canonical
  WHERE players_canonical."position" IS NOT NULL
  ORDER BY players_canonical.player_name, players_canonical.season DESC
),
base AS (
  SELECT DISTINCT ON (v_neeko_player_projection.player_id)
    v_neeko_player_projection.player_id,
    v_neeko_player_projection.player_name,
    v_neeko_player_projection.team,
    v_neeko_player_projection.opponent,
    v_neeko_player_projection.final_projection,
    v_neeko_player_projection.ceiling_estimate,
    v_neeko_player_projection.floor_estimate,
    v_neeko_player_projection.trend_3_vs_10,
    v_neeko_player_projection.consistency_score
  FROM afl.v_neeko_player_projection
  WHERE v_neeko_player_projection.final_projection > 0
  ORDER BY v_neeko_player_projection.player_id, v_neeko_player_projection.final_projection DESC
),
with_position AS (
  SELECT
    b.player_id,
    b.player_name,
    b.team,
    b.opponent,
    b.final_projection,
    b.ceiling_estimate,
    b.floor_estimate,
    b.trend_3_vs_10,
    b.consistency_score,
    pp.position_group AS "position"
  FROM base b
  LEFT JOIN player_positions pp ON pp.player_name = b.player_name
),
with_matchup AS (
  SELECT
    wp.player_id,
    wp.player_name,
    wp.team,
    wp.opponent,
    wp.final_projection,
    wp.ceiling_estimate,
    wp.floor_estimate,
    wp.trend_3_vs_10,
    wp.consistency_score,
    wp."position",
    round((COALESCE(m.matchup_multiplier, 1.0) - 1.0) * wp.final_projection * 0.40, 2) AS matchup_delta_position
  FROM with_position wp
  LEFT JOIN afl.v_position_matchup_multiplier_2025 m
    ON m.opponent_team = wp.opponent AND m."position" = wp."position"
),
with_position_avg AS (
  SELECT
    wm.player_id,
    wm.player_name,
    wm.team,
    wm.opponent,
    wm.final_projection,
    wm.ceiling_estimate,
    wm.floor_estimate,
    wm.trend_3_vs_10,
    wm.consistency_score,
    wm."position",
    wm.matchup_delta_position,
    COALESCE(pa.position_avg_points, wm.final_projection) AS position_avg_points
  FROM with_matchup wm
  LEFT JOIN afl.v_position_fantasy_average_2025 pa ON pa."position" = wm."position"
),
staged AS (
  SELECT
    with_position_avg.player_id,
    with_position_avg.player_name,
    with_position_avg.team,
    with_position_avg.opponent,
    with_position_avg.final_projection,
    with_position_avg.ceiling_estimate,
    with_position_avg.floor_estimate,
    with_position_avg.trend_3_vs_10,
    with_position_avg.consistency_score,
    with_position_avg."position",
    with_position_avg.position_avg_points,
    with_position_avg.matchup_delta_position,
    round(
      with_position_avg.final_projection
      + with_position_avg.trend_3_vs_10 * 0.18
      + with_position_avg.matchup_delta_position
      + CASE
          WHEN with_position_avg.trend_3_vs_10 > 0 THEN
            (with_position_avg.ceiling_estimate - with_position_avg.final_projection) * 0.08
          ELSE 0
        END,
      2
    ) AS projection_raw
  FROM with_position_avg
),
regressed AS (
  SELECT
    staged.player_id,
    staged.player_name,
    staged.team,
    staged.opponent,
    staged.final_projection,
    staged.ceiling_estimate,
    staged.floor_estimate,
    staged.trend_3_vs_10,
    staged.consistency_score,
    staged."position",
    staged.position_avg_points,
    staged.matchup_delta_position,
    staged.projection_raw,
    round(staged.projection_raw * 0.92 + staged.position_avg_points * 0.08, 2) AS projection_final_intermediate
  FROM staged
),
final_calc AS (
  SELECT
    regressed.player_id,
    regressed.player_name,
    regressed.team,
    regressed.final_projection,
    regressed.ceiling_estimate,
    regressed.floor_estimate,
    regressed.trend_3_vs_10,
    regressed.matchup_delta_position AS matchup_delta,
    regressed.consistency_score,
    round(
      regressed.projection_final_intermediate
      * LEAST(GREATEST(1.0 + (regressed.consistency_score::numeric - 50.0) / 400.0, 0.875), 1.125),
      2
    ) AS projection_final_computed
  FROM regressed
)
SELECT
  player_id,
  player_name,
  team,
  projection_final_computed AS projection_final,
  round(final_projection, 2)    AS final_projection,
  round(ceiling_estimate, 2)    AS ceiling_estimate,
  round(floor_estimate, 2)      AS floor_estimate,
  round(trend_3_vs_10, 2)       AS trend_3_vs_10,
  round(matchup_delta, 2)       AS matchup_delta,
  consistency_score
FROM final_calc
ORDER BY projection_final_computed DESC;
