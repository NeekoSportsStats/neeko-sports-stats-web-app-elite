/*
  # Fix position normalisation in v_rankings_premium and dependents

  ## Problem
  v_rankings_premium passes raw position labels from afl.players_canonical
  (e.g. "Gen. Defender", "Key Forward") to the frontend. The position filter
  expects "DEF", "MID", "FWD", "RUC" — so DEF and FWD always returned zero rows.

  ## Mapping applied
    Gen. Defender / Key Defender → DEF
    Gen. Forward / Key Forward / Mid-Forward → FWD
    Midfielder → MID
    Ruck → RUC
    (anything else) → MID

  ## Views rebuilt (drop order respects dependencies)
    1. v_captain_recommendations (depends on v_rankings_premium)
    2. v_rankings_free            (depends on v_rankings_premium)
    3. v_rankings_premium         (rebuilt with CASE normalisation)
    4. v_rankings_free            (re-created)
    5. v_captain_recommendations  (re-created)
*/

-- 1. Drop dependents first
DROP VIEW IF EXISTS v_captain_recommendations;
DROP VIEW IF EXISTS v_rankings_free;
DROP VIEW IF EXISTS v_rankings_premium;

-- 2. Rebuild v_rankings_premium with normalised position
CREATE VIEW v_rankings_premium AS
SELECT
  proj.player_id,
  proj.player_name,
  proj.team,
  CASE
    WHEN pc.position ILIKE '%defender%' THEN 'DEF'
    WHEN pc.position ILIKE '%forward%'  THEN 'FWD'
    WHEN pc.position ILIKE '%mid%'      THEN 'MID'
    WHEN pc.position ILIKE '%ruck%'     THEN 'RUC'
    ELSE 'MID'
  END AS position,
  proj.projection_final,
  proj.ceiling_estimate,
  proj.floor_estimate,
  proj.consistency_score,
  CASE
    WHEN proj.trend_3_vs_10 >= 15  THEN 90
    WHEN proj.trend_3_vs_10 >= 8   THEN 80
    WHEN proj.trend_3_vs_10 >= 3   THEN 70
    WHEN proj.trend_3_vs_10 >= -3  THEN 60
    WHEN proj.trend_3_vs_10 >= -10 THEN 45
    ELSE 30
  END::numeric AS form_rating,
  CASE
    WHEN proj.matchup_delta >= 10 THEN 90
    WHEN proj.matchup_delta >= 5  THEN 80
    WHEN proj.matchup_delta >= 0  THEN 65
    WHEN proj.matchup_delta >= -5 THEN 50
    ELSE 35
  END::numeric AS matchup_rating,
  CASE
    WHEN proj.projection_final > 0
      THEN ROUND((proj.ceiling_estimate - proj.projection_final) / proj.projection_final * 100)
    ELSE NULL
  END AS upside_rating,
  CASE
    WHEN proj.projection_final > 0
      THEN ROUND((proj.projection_final - proj.floor_estimate) / proj.projection_final * 100)
    ELSE NULL
  END AS risk_rating,
  ROUND(proj.consistency_score) AS projection_confidence,
  NULL::text AS ai_recommendation,
  ROUND(
    COALESCE(proj.projection_final, 0)               * 0.45
    + COALESCE(proj.ceiling_estimate, 0)             * 0.25
    + COALESCE(proj.consistency_score::numeric, 0)   * 0.20
    + GREATEST(COALESCE(proj.matchup_delta, 0), 0)   * 1.5
    + GREATEST(COALESCE(proj.trend_3_vs_10, 0), 0)   * 0.8,
    1
  ) AS captain_score,
  CASE
    WHEN proj.projection_final >= 115 AND proj.consistency_score >= 70 THEN 'Elite Captain'
    WHEN proj.projection_final >= 105 AND proj.consistency_score >= 60 THEN 'Strong Captain'
    WHEN proj.projection_final >= 95                                   THEN 'Captain Option'
    ELSE 'Risky Captain'
  END AS captain_rating
FROM v_player_detail_premium proj
LEFT JOIN afl.players_canonical pc
  ON  pc.player_name = proj.player_name
  AND pc.team        = proj.team
  AND pc.season      = 2026;

-- 3. Rebuild v_rankings_free (top 20, same columns)
CREATE VIEW v_rankings_free AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  captain_score,
  captain_rating
FROM v_rankings_premium
ORDER BY projection_final DESC NULLS LAST
LIMIT 20;

-- 4. Rebuild v_captain_recommendations
CREATE VIEW v_captain_recommendations AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating
FROM v_rankings_premium
ORDER BY captain_score DESC;
