/*
  # Create v_neeko_intel_fallers

  ## Purpose
  Powers the "Fallers" section of the Neeko Intel page.

  ## Logic
  Selects players from v_rankings_master where:
  - projection_confidence <= 40 (low confidence in projection), OR
  - risk_rating >= 70 (very high risk)
  These players are trending downward or are high-risk selections.

  ## Fields
  - player_id, player_name, team, position
  - projection_final
  - projection_confidence
  - risk_rating
  - form_rating
  - ai_recommendation
  - recommendation_color
  - recommendation_short

  ## Ordering
  projection_confidence ASC (lowest confidence first), limit 20

  ## Schema
  public
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_fallers AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.projection_confidence,
  r.risk_rating,
  r.form_rating,
  r.ai_recommendation,
  r.recommendation_color,
  COALESCE(rec.recommendation_short, r.recommendation_why) AS recommendation_short
FROM public.v_rankings_master r
LEFT JOIN public.ai_rankings_player_recos rec
  ON rec.player_id = r.player_id
WHERE
  r.projection_confidence <= 40
  OR r.risk_rating >= 70
ORDER BY r.projection_confidence ASC NULLS LAST
LIMIT 20;
