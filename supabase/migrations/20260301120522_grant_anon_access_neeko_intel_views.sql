/*
  # Grant anon SELECT access to Neeko Intel views and their source views

  ## Summary
  Grants SELECT permission to the anon role on all 6 Neeko Intel views
  and their upstream source views. This fixes 500 errors for unauthenticated
  (free) users who cannot see any Neeko Intel content.

  ## Permissions Added
  - v_neeko_intel_breakouts → anon
  - v_neeko_intel_captains  → anon
  - v_neeko_intel_risk      → anon
  - v_neeko_intel_risers    → anon
  - v_neeko_intel_fallers   → anon
  - v_neeko_intel_matches   → anon

  ## Source view permissions (required for view resolution)
  - v_rankings_master            → anon
  - v_captain_recommendations    → anon
  - v_ai_match_predictions_preview → anon
*/

-- ─── Neeko Intel views ────────────────────────────────────────────────────────

GRANT SELECT ON public.v_neeko_intel_breakouts TO anon;
GRANT SELECT ON public.v_neeko_intel_captains  TO anon;
GRANT SELECT ON public.v_neeko_intel_risk      TO anon;
GRANT SELECT ON public.v_neeko_intel_risers    TO anon;
GRANT SELECT ON public.v_neeko_intel_fallers   TO anon;
GRANT SELECT ON public.v_neeko_intel_matches   TO anon;

-- ─── Source views (upstream dependencies) ────────────────────────────────────

GRANT SELECT ON public.v_rankings_master              TO anon;
GRANT SELECT ON public.v_captain_recommendations      TO anon;
GRANT SELECT ON public.v_ai_match_predictions_preview TO anon;
