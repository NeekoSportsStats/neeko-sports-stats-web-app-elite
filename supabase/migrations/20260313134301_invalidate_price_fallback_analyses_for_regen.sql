/*
  # Invalidate analyses containing price-fallback language for regeneration

  ## What this does

  Clears the analysis and captain_recommendation fields for the 17 players whose
  generated text contains "without a defined price" or equivalent fallback language.

  Resets input_hash to force re-queuing by the AI generation worker on its next run.

  ## Safety

  Non-destructive to player records, rankings, projections, or other AI tables.
  Only clears the ai_player_analysis rows that contain the incorrect sentence.
*/

UPDATE public.ai_player_analysis
SET
  analysis = NULL,
  captain_recommendation = NULL,
  input_hash = NULL
WHERE
  analysis ILIKE '%without a defined price%'
  OR analysis ILIKE '%price is not defined%'
  OR analysis ILIKE '%price is unavailable%'
  OR analysis ILIKE '%no defined price%'
  OR analysis ILIKE '%lack a defined price%'
  OR analysis ILIKE '%assessing value becomes%';
