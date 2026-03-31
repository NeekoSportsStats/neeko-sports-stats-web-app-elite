/*
  # Queue missing AI players for regeneration

  ## Problem
  123 players in afl.player_rankings_cache have no recommendation_short or ai_summary.
  160 players in ai.player_ai_analysis have no summary_short (some don't exist in cache).

  After the infinite loop fix, all needs_regen = FALSE. We need to flag only the
  players genuinely missing AI content so the next regen wave picks them up.

  ## Fix
  Clear input_hash for players with no summary_short in ai.player_ai_analysis.
  This causes v_ai_player_analysis_input.needs_regen = TRUE for only those players.

  Players with existing valid AI content remain unaffected (needs_regen = FALSE).

  ## Expected outcome
  - ~123 players will have needs_regen = TRUE
  - The ai_regen_wave_5min cron will process them over the next ~30 minutes
  - No infinite loop — once content is generated, hash is stamped and loop stops
*/

UPDATE ai.player_ai_analysis
SET input_hash = NULL
WHERE summary_short IS NULL OR summary_short = '';
