/*
  # Populate recommendation_strength from canonical cache columns

  ## Problem
  The column `afl.player_rankings_cache.recommendation_strength` exists and is
  read by the frontend (`mapRankingRow.ts`) but was never written by
  `fn_populate_player_rankings_cache`. All rows had NULL.

  ## Fix
  1. Backfill all existing rows using `action_display + ' · ' + confidence_label`
     (e.g. "Strong Start · HIGH", "Hold · MEDIUM") derived from the two canonical
     fields that are already correctly populated.
  2. Add `recommendation_strength` to the ON CONFLICT UPDATE block of
     `fn_populate_player_rankings_cache` so future pipeline runs keep it current.
     We do this via a standalone backfill + a replacement of the enrichment
     function `afl.populate_rankings_cache` which runs after every seed pass.

  ## No data loss
  Only updates a column that was previously always NULL.
*/

-- Step 1: Backfill current rows immediately
UPDATE afl.player_rankings_cache
SET recommendation_strength =
  CASE
    WHEN action_display IS NOT NULL AND confidence_label IS NOT NULL
      THEN action_display || ' · ' || confidence_label
    WHEN action_display IS NOT NULL
      THEN action_display
    ELSE NULL
  END
WHERE recommendation_strength IS NULL
  AND (action_display IS NOT NULL OR confidence_label IS NOT NULL);

-- Step 2: Wire into the enrichment pass (afl.populate_rankings_cache)
-- This function runs at the end of fn_populate_player_rankings_cache and
-- on every pipeline enrichment step, so it will stay current.
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
BEGIN
  -- Sync AI content from ai.player_ai_analysis into cache
  UPDATE afl.player_rankings_cache rc
  SET
    summary_short        = COALESCE(pa.summary_short, rc.summary_short),
    summary_long         = COALESCE(pa.summary_long,  rc.summary_long),
    recommendation_short = COALESCE(pa.recommendation, rc.recommendation_short),
    ai_summary           = COALESCE(pa.summary_short, rc.ai_summary),
    -- Populate recommendation_strength from canonical action + confidence
    recommendation_strength = CASE
      WHEN rc.action_display IS NOT NULL AND rc.confidence_label IS NOT NULL
        THEN rc.action_display || ' · ' || rc.confidence_label
      WHEN rc.action_display IS NOT NULL
        THEN rc.action_display
      ELSE rc.recommendation_strength
    END
  FROM ai.player_ai_analysis pa
  WHERE pa.player_id = rc.player_id
    AND pa.needs_regen = false
    AND pa.summary_long IS NOT NULL
    AND pa.summary_long <> '';

  -- Also update recommendation_strength for rows with no AI match (keeps it current)
  UPDATE afl.player_rankings_cache
  SET recommendation_strength = CASE
      WHEN action_display IS NOT NULL AND confidence_label IS NOT NULL
        THEN action_display || ' · ' || confidence_label
      WHEN action_display IS NOT NULL
        THEN action_display
      ELSE NULL
    END
  WHERE recommendation_strength IS NULL
    AND (action_display IS NOT NULL OR confidence_label IS NOT NULL);

  INSERT INTO public.system_logs (event_type, log_level, message, created_at)
  VALUES ('cache_enrichment', 'info', 'afl.populate_rankings_cache: enrichment pass complete', NOW())
  ON CONFLICT DO NOTHING;
END;
$$;
