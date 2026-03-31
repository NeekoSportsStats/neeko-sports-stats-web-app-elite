/*
  # Create Premium Safe Preview Views

  ## Purpose
  Provides non-premium authenticated users with limited preview data so the frontend
  never shows hard errors or blank screens — only gracefully degraded content.

  ## New Views
  - public.v_match_predictions_preview
    Limited to 3 rows, returns only non-AI structural fields (no ai_summary,
    no prediction_explanation). Safe for any authenticated user.

  ## Strategy
  - AFLAIInsightsPage already handles empty arrays gracefully
  - Base afl tables now return 0 rows for non-premium users (RLS gated)
  - This preview view gives a structural teaser with no AI content

  ## Notes
  1. View is in public schema — accessible without .schema("afl") override
  2. Service role bypasses RLS entirely — edge functions unaffected
  3. No existing frontend files modified at this stage
*/

CREATE OR REPLACE VIEW public.v_match_predictions_preview
WITH (security_invoker = false)
AS
SELECT
  match_id,
  home_team,
  away_team,
  round_number,
  season,
  predicted_home_score,
  predicted_away_score,
  predicted_margin,
  predicted_total,
  confidence,
  updated_at
FROM afl.ai_match_predictions
WHERE season = 2026
ORDER BY round_number DESC, match_id
LIMIT 3;

GRANT SELECT ON public.v_match_predictions_preview TO authenticated;
GRANT SELECT ON public.v_match_predictions_preview TO anon;
