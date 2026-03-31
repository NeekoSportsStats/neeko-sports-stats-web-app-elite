/*
  # Hard reset AI outputs and force full regeneration

  ## Summary
  Clears all existing AI text from both the canonical AI table and the rankings cache,
  forcing a clean regeneration pass across all players.

  ## Changes
  - ai.player_ai_analysis: NULL out summary_short, summary_long, input_hash, generated_at
  - afl.player_rankings_cache: NULL out summary_short, summary_long, recommendation_short,
    recommendation_why, ai_summary, input_hash, ai_generated_at, ai_updated_at, ai_validation_passed

  ## Safe Mode
  - Rows are NOT deleted — only text fields are cleared
  - player_id and structural columns are preserved
*/

UPDATE ai.player_ai_analysis
SET
  summary_short     = NULL,
  summary_long      = NULL,
  input_hash        = NULL,
  generated_at      = NULL;

UPDATE afl.player_rankings_cache
SET
  summary_short        = NULL,
  summary_long         = NULL,
  recommendation_short = NULL,
  recommendation_why   = NULL,
  ai_summary           = NULL,
  ai_updated_at        = NULL,
  ai_generated_at      = NULL,
  ai_validation_passed = NULL;
