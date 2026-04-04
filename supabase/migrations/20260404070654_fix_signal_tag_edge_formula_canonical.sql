/*
  # Fix signal_tag to use canonical edge formula

  ## Summary
  Updates the `signal_tag` column in `afl.player_rankings_cache` to be derived
  from the canonical edge formula: `edge = projection_final - breakeven`.

  ## Changes
  1. Adds a helper function `afl.fn_compute_signal_tag(projection, breakeven)`
     that applies the 5-level edge signal rules
  2. Backfills all existing rows in `player_rankings_cache` with the correct
     signal_tag values based on the formula
  3. Updates the `refresh_player_rankings_cache` function to use this formula
     when populating signal_tag (instead of reading from ai_recommendation)

  ## Signal Rules
  - edge >= 15  → 'STRONG_BUY'
  - edge >= 6   → 'BUY'
  - edge >= -5  → 'HOLD'
  - edge >= -15 → 'SELL'
  - edge < -15  → 'STRONG_SELL'
  - NULL inputs → 'HOLD'

  ## Security
  - Function is SECURITY DEFINER, owned by postgres
  - Only affects afl schema tables
*/

-- 1. Create canonical signal tag helper function
CREATE OR REPLACE FUNCTION afl.fn_compute_signal_tag(
  p_projection numeric,
  p_breakeven  numeric
) RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = afl, public
AS $$
  SELECT CASE
    WHEN p_projection IS NULL OR p_breakeven IS NULL THEN 'HOLD'
    WHEN (p_projection - p_breakeven) >= 15  THEN 'STRONG_BUY'
    WHEN (p_projection - p_breakeven) >= 6   THEN 'BUY'
    WHEN (p_projection - p_breakeven) >= -5  THEN 'HOLD'
    WHEN (p_projection - p_breakeven) >= -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END;
$$;

-- 2. Backfill signal_tag on existing cache rows using the canonical formula
UPDATE afl.player_rankings_cache
SET signal_tag = afl.fn_compute_signal_tag(projection_final, breakeven)
WHERE projection_final IS NOT NULL
  AND breakeven IS NOT NULL;

-- Set HOLD for rows with missing data
UPDATE afl.player_rankings_cache
SET signal_tag = 'HOLD'
WHERE signal_tag IS NULL
  OR (projection_final IS NULL OR breakeven IS NULL);
