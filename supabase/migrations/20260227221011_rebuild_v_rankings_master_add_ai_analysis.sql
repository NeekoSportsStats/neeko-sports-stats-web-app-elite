/*
  # Rebuild v_rankings_master to include ai_analysis column

  ## Changes
  - Drops and recreates v_rankings_master
  - Adds ai_analysis column (recommendation_long from ai_rankings_player_recos)
  - Preserves all existing columns and sort order
*/

DROP VIEW IF EXISTS v_rankings_master;

CREATE VIEW v_rankings_master AS
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
  ai_analysis,
  captain_score,
  captain_rating
FROM v_rankings_premium
ORDER BY projection_final DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO authenticated;
GRANT SELECT ON public.v_rankings_master TO anon;
