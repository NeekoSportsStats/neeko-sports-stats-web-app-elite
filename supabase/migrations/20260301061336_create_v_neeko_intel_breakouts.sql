/*
  # Create v_neeko_intel_breakouts

  ## Purpose
  Powers the "Breakouts & Must Starts" section of the Neeko Intel page.

  ## Logic
  Selects players from v_rankings_master where:
  - projection_confidence >= 60, OR
  - ai_recommendation = 'MUST START', OR
  - ai_recommendation = 'HIGH CONFIDENCE'
  Joins with ai_rankings_player_recos to surface recommendation_short.

  ## Fields
  - player_id, player_name, team, position
  - projection_final (projected fantasy score)
  - projection_confidence (0-100 confidence in projection)
  - form_rating (recent form)
  - matchup_rating (matchup quality)
  - risk_rating (risk level)
  - ai_recommendation (label)
  - recommendation_color (hex/name color for UI badge)
  - recommendation_short (short AI reasoning text)

  ## Ordering
  projection_final DESC, limit 20

  ## Schema
  public (accessible to frontend without schema prefix)
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_breakouts AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.projection_confidence,
  r.form_rating,
  r.matchup_rating,
  r.risk_rating,
  r.ai_recommendation,
  r.recommendation_color,
  COALESCE(rec.recommendation_short, r.recommendation_why) AS recommendation_short
FROM public.v_rankings_master r
LEFT JOIN public.ai_rankings_player_recos rec
  ON rec.player_id = r.player_id
WHERE
  r.projection_confidence >= 60
  OR r.ai_recommendation = 'MUST START'
  OR r.ai_recommendation = 'HIGH CONFIDENCE'
ORDER BY r.projection_final DESC NULLS LAST
LIMIT 20;
