/*
  # Restore v_captain_recommendations view

  Restores the public.v_captain_recommendations view that the frontend
  depends on via /rest/v1/v_captain_recommendations.

  Selects top 5 players by captain_score from v_rankings_master.
*/

CREATE OR REPLACE VIEW public.v_captain_recommendations AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE captain_score IS NOT NULL
ORDER BY captain_score DESC
LIMIT 5;
