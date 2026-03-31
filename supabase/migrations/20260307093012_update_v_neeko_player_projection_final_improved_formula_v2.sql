/*
  # Update afl.v_neeko_player_projection_final — Improved Projection Formula (v2)

  ## Output column contract (unchanged, positions 1-10 preserved)
  1. player_id
  2. player_name
  3. team
  4. projection_final      — final output score (formula updated)
  5. final_projection      — base pre-adjustment projection (pass-through)
  6. ceiling_estimate
  7. floor_estimate
  8. trend_3_vs_10
  9. matchup_delta         — NOW position-based (replaces old team-wide archive delta)
  10. consistency_score

  ## Formula changes (full description in migration filename companion)

  ### Trend coefficient reduced
  trend_3_vs_10 * 0.18  (was 0.25)

  ### matchup_delta now position-based
  matchup_delta = (matchup_multiplier - 1.0) * final_projection * 0.30
  Applied at coefficient 0.50 in projection_raw  (was 0.70)

  ### Conditional ceiling uplift
  Only when trend_3_vs_10 > 0: (ceiling - base) * 0.08  (was always * 0.10)

  ### Positional regression
  (projection_raw * 0.90) + (position_avg_points * 0.10)

  ### Consistency stabilisation
  Multiplier: 1 + (consistency_score - 50) / 400
  Clamped to [0.875, 1.125]
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection_final AS
WITH player_positions AS (
    SELECT DISTINCT ON (player_name)
        player_name,
        CASE
            WHEN position ILIKE '%defender%' THEN 'DEF'
            WHEN position ILIKE '%mid%'      THEN 'MID'
            WHEN position ILIKE '%forward%'  THEN 'FWD'
            WHEN position ILIKE '%ruck%'     THEN 'RUC'
            ELSE NULL
        END AS position_group
    FROM afl.players_canonical
    WHERE position IS NOT NULL
    ORDER BY player_name, season DESC
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
    ORDER BY v_neeko_player_projection.player_id,
             v_neeko_player_projection.final_projection DESC
),
with_position AS (
    SELECT
        b.*,
        pp.position_group AS position
    FROM base b
    LEFT JOIN player_positions pp ON pp.player_name = b.player_name
),
with_matchup AS (
    SELECT
        wp.*,
        round(
            ((COALESCE(m.matchup_multiplier, 1.0) - 1.0)
            * wp.final_projection
            * 0.30)::numeric,
            2
        ) AS matchup_delta_position
    FROM with_position wp
    LEFT JOIN afl.v_position_matchup_multiplier_2025 m
        ON m.opponent_team = wp.opponent
        AND m.position     = wp.position
),
with_position_avg AS (
    SELECT
        wm.*,
        COALESCE(pa.position_avg_points, wm.final_projection) AS position_avg_points
    FROM with_matchup wm
    LEFT JOIN afl.v_position_fantasy_average_2025 pa
        ON pa.position = wm.position
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
        -- projection_raw: base + reduced trend + position matchup at 0.50 + conditional ceiling
        round(
            (
              final_projection
              + (trend_3_vs_10 * 0.18)
              + (matchup_delta_position * 0.50)
              + CASE
                    WHEN trend_3_vs_10 > 0
                    THEN (ceiling_estimate - final_projection) * 0.08
                    ELSE 0
                END
            )::numeric,
            2
        ) AS projection_raw
    FROM with_position_avg
),
regressed AS (
    SELECT
        *,
        round(
            (projection_raw * 0.90 + position_avg_points * 0.10)::numeric,
            2
        ) AS projection_final_intermediate
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
        matchup_delta_position                   AS matchup_delta,
        consistency_score,
        -- consistency stabilisation: clamp multiplier to [0.875, 1.125]
        round(
            (
              projection_final_intermediate
              * LEAST(
                    GREATEST(
                        1.0 + ((consistency_score::numeric - 50.0) / 400.0),
                        0.875
                    ),
                    1.125
                )
            )::numeric,
            2
        ) AS projection_final_computed
    FROM regressed
)
SELECT
    player_id,                                          -- 1
    player_name,                                        -- 2
    team,                                               -- 3
    projection_final_computed  AS projection_final,     -- 4
    round(final_projection, 2) AS final_projection,     -- 5
    round(ceiling_estimate, 2) AS ceiling_estimate,     -- 6
    round(floor_estimate, 2)   AS floor_estimate,       -- 7
    round(trend_3_vs_10, 2)    AS trend_3_vs_10,        -- 8
    round(matchup_delta, 2)    AS matchup_delta,        -- 9
    consistency_score                                   -- 10
FROM final_calc
ORDER BY projection_final_computed DESC;
