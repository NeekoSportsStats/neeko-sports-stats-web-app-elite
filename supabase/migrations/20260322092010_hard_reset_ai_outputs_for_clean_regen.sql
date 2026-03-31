/*
  # Hard Reset AI Outputs — Clean Regen

  Clears all AI-generated text from both the source table and the rankings cache
  so no stale "HOLD" language remains. The recommendation_color and ai_recommendation
  model fields are preserved (they come from the projection model, not the AI).

  Tables affected:
  - ai.player_ai_analysis: clears summary_short, summary_long, input_hash, generated_at
  - afl.player_rankings_cache: clears summary_short, summary_long

  This forces needs_regen = TRUE for all players so the next wave run regenerates everyone.
*/

UPDATE ai.player_ai_analysis
SET
  summary_short = NULL,
  summary_long  = NULL,
  input_hash    = NULL,
  generated_at  = NULL;

UPDATE afl.player_rankings_cache
SET
  summary_short = NULL,
  summary_long  = NULL;
