/*
  # Audit Fix 4b: Correct ai_validation_passed=false for Players with Valid AI

  ## Problem
  After Fix 4 backfill, 104 players still show ai_validation_passed=false in
  player_rankings_cache even though they have valid AI content in
  ai.player_ai_analysis (summary_short IS NOT NULL, generated_at IS NOT NULL).

  This happened because Fix 4 used COALESCE for the text fields but always
  recomputed ai_validation_passed from the JOIN — however some rows had
  ai_validation_passed already set to FALSE (not NULL) from a prior upsert
  during the regen waves, and the prior backfill's CASE WHEN correctly
  evaluated to TRUE. The issue is a timing race where upsert_player_ai_analysis
  was writing to ai.player_ai_analysis AFTER the backfill ran.

  ## Fix
  Simple targeted UPDATE: set ai_validation_passed = true for any cache row
  where the player has both summary_short and generated_at in ai.player_ai_analysis.
  This is always safe — we're only marking valid if the canonical source confirms it.
*/

UPDATE afl.player_rankings_cache rc
SET ai_validation_passed = TRUE
FROM ai.player_ai_analysis pa
WHERE pa.player_id = rc.player_id
  AND pa.summary_short IS NOT NULL
  AND pa.generated_at IS NOT NULL
  AND (rc.ai_validation_passed IS NULL OR rc.ai_validation_passed = FALSE);
