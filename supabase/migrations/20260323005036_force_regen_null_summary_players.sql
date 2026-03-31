/*
  # Force Regen for Players with Missing AI Output

  ## Problem
  37 players in ai.player_ai_analysis have NULL summary_short / summary_long.
  These rows exist (so needs_regen checks the hash comparison path) but have
  no actual content. Because input_hash is also NULL on all rows (pre-fix state),
  the view's needs_regen = true for all 687 players anyway.

  ## Fix
  For the 37 players with missing content, ensure they are at the front of the
  queue by setting their summary_short = NULL sentinel and input_hash = NULL
  so needs_regen stays true even after the batch hash fix lands.

  No data is deleted — only the null-content rows are touched.
*/

UPDATE ai.player_ai_analysis
SET
  input_hash        = NULL,
  generated_at      = NULL
WHERE summary_short IS NULL
   OR summary_long  IS NULL;

-- Log how many were touched
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM ai.player_ai_analysis
  WHERE summary_short IS NULL OR summary_long IS NULL;

  RAISE NOTICE 'Players queued for priority regen: %', v_count;
END $$;
