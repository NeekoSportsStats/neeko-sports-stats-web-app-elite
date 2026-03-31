/*
  # Create v_neeko_intel_captains

  ## Purpose
  Powers the "Captain Picks" and "Elite Captain Locks" sections of the Neeko Intel page.

  ## Logic
  Joins v_captain_recommendations (primary captain data) with v_rankings_master
  for full projection context, and ai_rankings_player_recos for recommendation_short.

  ## Fields
  - player_id, player_name, team
  - projection_final (projected fantasy score)
  - ceiling_estimate (ceiling score)
  - consistency_score (how consistent the player is)
  - captain_score (composite captain ranking score)
  - captain_rating (label: e.g., ELITE CAPTAIN, CAPTAIN LOCK)
  - captain_confidence (0-100 confidence percentile)
  - recommendation_short (short AI reasoning text)

  ## Ordering
  captain_score DESC, limit 20

  ## Schema
  public
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_captains AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.projection_final,
  c.ceiling_estimate,
  c.consistency_score,
  c.captain_score,
  c.captain_rating,
  c.captain_confidence,
  COALESCE(rec.recommendation_short, r.recommendation_why) AS recommendation_short
FROM public.v_captain_recommendations c
LEFT JOIN public.v_rankings_master r
  ON r.player_id = c.player_id
LEFT JOIN public.ai_rankings_player_recos rec
  ON rec.player_id = c.player_id
ORDER BY c.captain_score DESC NULLS LAST
LIMIT 20;
