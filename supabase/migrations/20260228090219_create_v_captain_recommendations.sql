/*
  # Recreate v_captain_recommendations

  ## Summary
  Restores the captain recommendations view that was accidentally dropped
  via CASCADE when ai_rankings_player_recos was rebuilt.

  ## Changes
  - Creates v_captain_recommendations sourced from v_rankings_master
  - Returns top 5 players by captain_score
  - Grants SELECT to authenticated and anon

  ## Columns
  - player_id, player_name, team
  - projection_final, ceiling_estimate, consistency_score
  - captain_score, captain_rating
*/

DROP VIEW IF EXISTS public.v_captain_recommendations;

CREATE VIEW public.v_captain_recommendations AS
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

GRANT SELECT ON public.v_captain_recommendations TO authenticated, anon;
