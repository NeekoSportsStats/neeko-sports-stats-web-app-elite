/*
  # Create afl.v_rankings_ai_content — Canonical Rankings AI Diagnostic View

  ## Purpose

  Provides a single canonical source for all AI content fields used in the Rankings UI.
  Used for debugging, validation, and as a reference for correct field mapping.

  ## Fields

  - player_id / player_name / team / position
  - ai_recommendation_label  → badge label (BUY/START/HOLD/SIT/SELL)
  - ai_recommendation_short  → compact 1–2 sentence summary (modal AI Rec card)
  - ai_recommendation_why    → short WHY reason (table WHY column)
  - ai_analysis_long         → full extended analysis (modal Extended Analysis only)
  - captain_verdict          → captain-specific text (modal Captain Verdict only)
  - ai_generated_at          → most recent AI timestamp
  - content_status           → full / partial / fallback_only / missing

  ## Content Status Rules

  - full          = has short + long analysis + captain verdict
  - partial       = has short + long analysis but no captain verdict
  - fallback_only = has recommendation_short only (no full analysis)
  - missing       = no AI content at all
*/

CREATE OR REPLACE VIEW afl.v_rankings_ai_content AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,

  -- AI badge label (BUY / START / HOLD / SIT / SELL)
  c.ai_recommendation                     AS ai_recommendation_label,
  c.recommendation_color,

  -- Compact 1–2 sentence summary — used in modal AI Rec card
  c.recommendation_short                  AS ai_recommendation_short,

  -- Short WHY reason — used in table WHY column (same compact text)
  c.recommendation_why                    AS ai_recommendation_why,

  -- Full extended analysis — used in modal Extended Analysis block only
  -- Sources: ai_player_analysis.analysis (preferred) → recommendation_long (fallback)
  c.ai_summary                            AS ai_analysis_long,

  -- Captain-specific verdict — from ai_player_analysis only
  apa.captain_recommendation              AS captain_verdict,

  -- Most recent AI timestamp
  c.ai_updated_at                         AS ai_generated_at,

  -- Content status for debugging
  CASE
    WHEN c.recommendation_short IS NOT NULL
      AND c.ai_summary IS NOT NULL
      AND apa.captain_recommendation IS NOT NULL
      THEN 'full'
    WHEN c.recommendation_short IS NOT NULL
      AND c.ai_summary IS NOT NULL
      THEN 'partial'
    WHEN c.recommendation_short IS NOT NULL
      THEN 'fallback_only'
    ELSE 'missing'
  END                                     AS content_status

FROM afl.player_rankings_cache c
LEFT JOIN public.ai_player_analysis apa
  ON apa.player_id = c.player_id::bigint;

GRANT SELECT ON afl.v_rankings_ai_content TO anon, authenticated;
