/*
  # Backfill recommendation_short in ai_rankings_player_recos

  ## Summary
  recommendation_short was NULL for all 769 rows. Backfills it as the first
  sentence of recommendation_long (up to the first period), capped at 120 chars
  if no period is found.

  ## Logic:
  - If recommendation_long contains a period: take text up to and including first period
  - Otherwise: take first 120 characters
  - Only updates rows where recommendation_short IS NULL or empty
  - Only updates rows where recommendation_long IS NOT NULL
*/

UPDATE public.ai_rankings_player_recos
SET recommendation_short = CASE
  WHEN POSITION('.' IN recommendation_long) > 0
    THEN TRIM(SUBSTRING(recommendation_long FROM 1 FOR POSITION('.' IN recommendation_long)))
  ELSE LEFT(recommendation_long, 120)
END
WHERE (recommendation_short IS NULL OR recommendation_short = '')
  AND recommendation_long IS NOT NULL
  AND recommendation_long != '';
