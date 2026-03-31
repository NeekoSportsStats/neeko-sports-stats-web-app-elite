/*
  # Fix upsert_player_ai_analysis — Remove confidence writes from legacy overloads

  ## Problem
  Two legacy overloads of upsert_player_ai_analysis accept p_confidence and write
  it into ai.player_ai_analysis.confidence. This column was getting set to the
  default value (65) for most players, corrupting the confidence signal.

  ## Root cause
  The edge function was calling the (player_id, recommendation, confidence, ...) overload,
  which wrote p_confidence into ai.player_ai_analysis. That table's confidence column
  has no relationship to the real projection_confidence in afl.player_rankings_cache.

  ## Fix
  1. Drop both legacy overloads that accept p_confidence
  2. The canonical overload (player_id, recommendation, recommendation_short, recommendation_why, ...)
     writes only to afl.player_rankings_cache and never touches confidence — this is correct
  3. projection_confidence ownership stays exclusively with the projection engine

  ## Ownership rule enforced
  projection_confidence MUST ONLY come from the projection engine / model pipeline.
  AI, edge functions, and admin commands must NEVER write confidence.
*/

-- Drop legacy overload 1: (player_id, recommendation, confidence integer, ...)
DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(
  integer, text, integer, text, text, text, text
);

-- Drop legacy overload 2: (player_id, recommendation, confidence numeric, ..., ai_input_snapshot, prompt_version)
DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(
  integer, text, numeric, text, text, text, text, jsonb, text
);
