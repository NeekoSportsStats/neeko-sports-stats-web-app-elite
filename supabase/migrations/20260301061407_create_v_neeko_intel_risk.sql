/*
  # Create v_neeko_intel_risk

  ## Purpose
  Powers the "Risk & Avoid" section of the Neeko Intel page.

  ## Logic
  Selects players from v_rankings_master where:
  - risk_rating >= 60, OR
  - consistency_score <= 40 (maps to 'High Risk' zone), OR
  - ai_recommendation = 'AVOID'
  These players represent the highest-risk selections for fantasy coaches.

  ## Fields
  - player_id, player_name, team, position
  - projection_final
  - projection_confidence
  - risk_rating (0-100, higher = more risky)
  - consistency_score (lower = less consistent)
  - ai_recommendation
  - recommendation_color
  - recommendation_short

  ## Ordering
  risk_rating DESC, limit 20

  ## Schema
  public
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_risk AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.projection_confidence,
  r.risk_rating,
  r.consistency_score,
  r.ai_recommendation,
  r.recommendation_color,
  COALESCE(rec.recommendation_short, r.recommendation_why) AS recommendation_short
FROM public.v_rankings_master r
LEFT JOIN public.ai_rankings_player_recos rec
  ON rec.player_id = r.player_id
WHERE
  r.risk_rating >= 60
  OR r.consistency_score <= 40
  OR r.ai_recommendation = 'AVOID'
ORDER BY r.risk_rating DESC NULLS LAST
LIMIT 20;
