/*
  # Create v_neeko_match_predictions

  Clean public wrapper over v_ai_match_predictions_preview.
  Exposes all columns needed by the Neeko Intel Match Projections
  section with a stable, predictable column set.
*/

CREATE OR REPLACE VIEW public.v_neeko_match_predictions
WITH (security_invoker = false)
AS
SELECT
  id,
  match_id,
  home_team,
  away_team,
  round_number,
  season,
  prediction,
  predicted_home_score,
  predicted_away_score,
  predicted_margin,
  predicted_total,
  confidence,
  ai_summary,
  prediction_explanation,
  created_at,
  updated_at
FROM public.v_ai_match_predictions_preview
ORDER BY round_number ASC NULLS LAST;

GRANT SELECT ON public.v_neeko_match_predictions TO anon, authenticated;
