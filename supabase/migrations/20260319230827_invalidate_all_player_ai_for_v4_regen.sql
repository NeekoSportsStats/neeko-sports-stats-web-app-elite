/*
  # Invalidate All Player AI Analyses for v4 Prompt Regen

  ## Purpose
  All 687 rows in player_rankings_cache were generated with the old prompt (pre-v4).
  The v4 prompt fixes:
  - SELL contradiction (113 rows had positive language)
  - Templated "this round" / "primed for" phrases (575 / 188 occurrences)
  - Weak recommendation alignment
  
  This migration clears the input_hash on all ai_player_analysis rows so that
  needs_regen = true for every player, forcing the generate-player-ai v4 function
  to regenerate all outputs on next run.

  ## Changes
  - Sets input_hash = NULL on all rows in ai.player_ai_analysis
  - This causes needs_regen = true in v_ai_player_analysis_input view
*/

UPDATE ai.player_ai_analysis
SET input_hash = NULL;
