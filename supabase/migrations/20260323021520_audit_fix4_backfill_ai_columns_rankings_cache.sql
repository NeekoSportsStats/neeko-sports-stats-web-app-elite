/*
  # Audit Fix 4: Backfill AI Columns in player_rankings_cache

  ## Problem
  Due to the previous ON CONFLICT bug (Fix 2), existing rows in
  afl.player_rankings_cache have NULL values for:
  - summary_short, summary_long (AI text fields)
  - ai_prompt_version
  - ai_validation_passed
  - ai_generated_at

  The cache rebuild function is now fixed, but existing rows need a one-time
  backfill from the canonical ai.player_ai_analysis table.

  ## Fix
  Single UPDATE joining rankings_cache to player_ai_analysis:
  - summary_short: filled from aia.summary_short (COALESCE to preserve existing)
  - summary_long: filled from aia.summary_long (COALESCE to preserve existing)
  - ai_prompt_version: filled from aia.model (COALESCE to preserve existing)
  - ai_generated_at: filled from aia.generated_at (COALESCE to preserve existing)
  - ai_validation_passed: recomputed — true only when both generated_at and
    summary_short are non-null in the AI analysis table

  ## Safety
  Uses COALESCE so existing non-null values are never overwritten.
  ai_validation_passed is always recomputed from fresh source data.
*/

UPDATE afl.player_rankings_cache rc
SET
  summary_short        = COALESCE(rc.summary_short,    pa.summary_short),
  summary_long         = COALESCE(rc.summary_long,     pa.summary_long),
  ai_prompt_version    = COALESCE(rc.ai_prompt_version, pa.model),
  ai_generated_at      = COALESCE(rc.ai_generated_at,  pa.generated_at),
  ai_validation_passed = CASE
    WHEN pa.summary_short IS NOT NULL AND pa.generated_at IS NOT NULL
    THEN TRUE
    ELSE FALSE
  END
FROM ai.player_ai_analysis pa
WHERE pa.player_id = rc.player_id;
