/*
  # Create v_neeko_intel_risers

  ## Purpose
  Powers the "Risers" section of the Neeko Intel page.

  ## Logic
  Selects players from v_rankings_master where:
  - upside_rating >= 8 (meaningful upside potential)
  - ai_recommendation != 'AVOID' (only positive plays)
  These are players with high ceiling and strong upside this round.

  ## Fields
  - player_id, player_name, team, position
  - projection_final
  - projection_confidence
  - upside_rating (upside potential, higher = more ceiling)
  - form_rating
  - ai_recommendation
  - recommendation_color
  - recommendation_short

  ## Ordering
  upside_rating DESC, limit 20

  ## Schema
  public
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_risers AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.projection_confidence,
  r.upside_rating,
  r.form_rating,
  r.ai_recommendation,
  r.recommendation_color,
  COALESCE(rec.recommendation_short, r.recommendation_why) AS recommendation_short
FROM public.v_rankings_master r
LEFT JOIN public.ai_rankings_player_recos rec
  ON rec.player_id = r.player_id
WHERE
  r.upside_rating >= 8
  AND (r.ai_recommendation IS NULL OR r.ai_recommendation != 'AVOID')
ORDER BY r.upside_rating DESC NULLS LAST
LIMIT 20;
