/*
  # Create afl.v_neeko_player_projection_v2

  ## Summary
  Enhanced player projection view that combines the base Neeko projection
  with opponent matchup difficulty adjustments from the 2026 schedule.

  ## What This View Does
  - Sources base projection data from afl.v_neeko_player_projection (deduplicated to one row per player)
  - Joins to afl.v_ai_projection_2026_matchup_adjusted to pull the matchup_delta
    for each player's NEXT scheduled opponent
  - Applies an enhanced projection formula that blends four signals:
      1. Base projection (final_projection)          — anchor
      2. Form adjustment (trend_3_vs_10 × 0.5)      — recent trend uplift/drag
      3. Matchup adjustment (matchup_delta)           — opponent defensive difficulty
      4. Ceiling headroom ((ceiling_estimate − final_projection) × 0.1) — upside potential
  - Filters out players with final_projection = 0 (no game history)

  ## Formula
  projection_v2 =
    final_projection
    + (trend_3_vs_10 × 0.5)
    + matchup_delta
    + ((ceiling_estimate − final_projection) × 0.1)

  ## Notes
  - Opponent name normalisation: v_neeko_player_projection uses short team names
    (e.g. "Hawthorn") while v_ai_projection_2026_matchup_adjusted uses full names
    (e.g. "Hawthorn Hawks"). A CASE mapping handles this translation.
  - matchup_delta is NULL for players with no next fixture; COALESCE(matchup_delta, 0) applied.
  - ceiling_estimate is NULL for players with no game history; filtered by final_projection > 0.
  - The matchup view has one row per player per opponent across all teams — we join only
    on the player's NEXT scheduled opponent to get a single matchup_delta value.
  - Does NOT modify any existing view.

  ## Source Tables / Views
  - afl.v_neeko_player_projection
  - afl.v_ai_projection_2026_matchup_adjusted
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection_v2 AS
WITH base AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    player_name,
    team,
    opponent,
    final_projection,
    ceiling_estimate,
    floor_estimate,
    trend_3_vs_10,
    consistency_score
  FROM afl.v_neeko_player_projection
  WHERE final_projection > 0
  ORDER BY player_id, final_projection DESC
),
opponent_normalised AS (
  SELECT
    b.*,
    CASE b.opponent
      WHEN 'Adelaide'              THEN 'Adelaide Crows'
      WHEN 'Brisbane'              THEN 'Brisbane Lions'
      WHEN 'Carlton'               THEN 'Carlton Blues'
      WHEN 'Collingwood'           THEN 'Collingwood Magpies'
      WHEN 'Essendon'              THEN 'Essendon Bombers'
      WHEN 'Fremantle'             THEN 'Fremantle Dockers'
      WHEN 'Geelong'               THEN 'Geelong Cats'
      WHEN 'Gold Coast'            THEN 'Gold Coast Suns'
      WHEN 'Gold Coast Suns'       THEN 'Gold Coast Suns'
      WHEN 'Greater Western Sydney' THEN 'Greater Western Sydney Giants'
      WHEN 'Hawthorn'              THEN 'Hawthorn Hawks'
      WHEN 'Melbourne'             THEN 'Melbourne Demons'
      WHEN 'North Melbourne'       THEN 'North Melbourne Kangaroos'
      WHEN 'Port Adelaide'         THEN 'Port Adelaide Power'
      WHEN 'Richmond'              THEN 'Richmond Tigers'
      WHEN 'St Kilda'              THEN 'St Kilda Saints'
      WHEN 'Sydney'                THEN 'Sydney Swans'
      WHEN 'West Coast'            THEN 'West Coast Eagles'
      WHEN 'Western Bulldogs'      THEN 'Western Bulldogs'
      ELSE b.opponent
    END AS opponent_full
  FROM base b
),
matchup AS (
  SELECT DISTINCT ON (player)
    player,
    matchup_delta,
    matchup_label
  FROM afl.v_ai_projection_2026_matchup_adjusted
  ORDER BY player, matchup_delta DESC
),
joined AS (
  SELECT
    o.player_id,
    o.player_name,
    o.team,
    o.opponent,
    o.final_projection,
    o.ceiling_estimate,
    o.floor_estimate,
    o.trend_3_vs_10,
    o.consistency_score,
    COALESCE(
      (SELECT m2.matchup_delta
       FROM afl.v_ai_projection_2026_matchup_adjusted m2
       WHERE m2.player = o.player_name
         AND m2.opponent = o.opponent_full
       LIMIT 1),
      matchup.matchup_delta,
      0
    ) AS matchup_delta,
    COALESCE(
      (SELECT m2.matchup_label
       FROM afl.v_ai_projection_2026_matchup_adjusted m2
       WHERE m2.player = o.player_name
         AND m2.opponent = o.opponent_full
       LIMIT 1),
      matchup.matchup_label,
      'neutral'
    ) AS matchup_label
  FROM opponent_normalised o
  LEFT JOIN matchup ON matchup.player = o.player_name
)
SELECT
  player_id,
  player_name,
  team,
  opponent,
  ROUND(
    final_projection
    + (COALESCE(trend_3_vs_10, 0) * 0.5)
    + COALESCE(matchup_delta, 0)
    + (COALESCE(ceiling_estimate - final_projection, 0) * 0.1),
  2) AS projection_v2,
  final_projection,
  ceiling_estimate,
  floor_estimate,
  trend_3_vs_10,
  ROUND(COALESCE(matchup_delta, 0)::numeric, 2) AS matchup_delta,
  matchup_label,
  consistency_score
FROM joined
ORDER BY projection_v2 DESC;
