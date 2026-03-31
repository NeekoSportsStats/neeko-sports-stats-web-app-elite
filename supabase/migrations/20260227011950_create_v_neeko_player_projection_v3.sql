/*
  # Create afl.v_neeko_player_projection_v3

  ## Summary
  Player projection view using a fully multiplicative blending formula.
  This is the v3 variant of the Neeko player projection engine.

  ## Formula
  projection_v3 =
    final_projection
    * (trend_3_vs_10 * 0.25)
    * (matchup_delta * 0.7)
    * ((ceiling_estimate - final_projection) * 0.1)

  ## Important Behaviour Note
  Because all four factors are multiplied together, the sign of projection_v3
  is determined by the parity of negative factors:
    - Even number of negative terms → positive result (e.g. negative trend + negative matchup = positive)
    - Odd number of negative terms  → negative result
  Players with no next fixture (matchup_delta = 0) will produce projection_v3 = 0.

  ## Source Tables / Views
  - afl.v_neeko_player_projection (base signals: final_projection, trend, ceiling, floor)
  - afl.v_ai_projection_2026_matchup_adjusted (matchup_delta per player × opponent)

  ## Join Strategy
  - Deduplicate v_neeko_player_projection to one row per player_id (highest final_projection)
  - Join matchup view on player_name = player AND normalised opponent name (short → full)
  - COALESCE(matchup_delta, 0) for players with no scheduled fixture

  ## Filters
  - final_projection > 0

  ## Does NOT modify any existing view
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection_v3 AS
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
      WHEN 'Adelaide'               THEN 'Adelaide Crows'
      WHEN 'Brisbane'               THEN 'Brisbane Lions'
      WHEN 'Carlton'                THEN 'Carlton Blues'
      WHEN 'Collingwood'            THEN 'Collingwood Magpies'
      WHEN 'Essendon'               THEN 'Essendon Bombers'
      WHEN 'Fremantle'              THEN 'Fremantle Dockers'
      WHEN 'Geelong'                THEN 'Geelong Cats'
      WHEN 'Gold Coast'             THEN 'Gold Coast Suns'
      WHEN 'Gold Coast Suns'        THEN 'Gold Coast Suns'
      WHEN 'Greater Western Sydney' THEN 'Greater Western Sydney Giants'
      WHEN 'Hawthorn'               THEN 'Hawthorn Hawks'
      WHEN 'Melbourne'              THEN 'Melbourne Demons'
      WHEN 'North Melbourne'        THEN 'North Melbourne Kangaroos'
      WHEN 'Port Adelaide'          THEN 'Port Adelaide Power'
      WHEN 'Richmond'               THEN 'Richmond Tigers'
      WHEN 'St Kilda'               THEN 'St Kilda Saints'
      WHEN 'Sydney'                 THEN 'Sydney Swans'
      WHEN 'West Coast'             THEN 'West Coast Eagles'
      WHEN 'Western Bulldogs'       THEN 'Western Bulldogs'
      ELSE b.opponent
    END AS opponent_full
  FROM base b
),
with_matchup AS (
  SELECT
    o.*,
    COALESCE(
      (
        SELECT m.matchup_delta
        FROM afl.v_ai_projection_2026_matchup_adjusted m
        WHERE m.player   = o.player_name
          AND m.opponent = o.opponent_full
        LIMIT 1
      ),
      0
    ) AS matchup_delta
  FROM opponent_normalised o
)
SELECT
  player_id,
  player_name,
  team,
  projection_v3,
  final_projection,
  ceiling_estimate,
  floor_estimate,
  trend_3_vs_10,
  matchup_delta,
  consistency_score
FROM (
  SELECT
    player_id,
    player_name,
    team,
    ROUND(
      (
        final_projection
        * (trend_3_vs_10    * 0.25)
        * (matchup_delta    * 0.7)
        * ((ceiling_estimate - final_projection) * 0.1)
      )::numeric,
      2
    ) AS projection_v3,
    final_projection,
    ceiling_estimate,
    floor_estimate,
    trend_3_vs_10,
    ROUND(matchup_delta::numeric, 2) AS matchup_delta,
    consistency_score
  FROM with_matchup
) ranked
ORDER BY projection_v3 DESC;
