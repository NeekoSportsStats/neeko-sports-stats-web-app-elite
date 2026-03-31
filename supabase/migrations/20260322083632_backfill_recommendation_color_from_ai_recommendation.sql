/*
  # Backfill recommendation_color for all players where it is NULL

  All 687 players currently have recommendation_color = NULL because the
  edge function was passing p_color = null. This derives color from
  ai_recommendation and backfills the cache.

  Color mapping:
    BUY   → 'green'
    SELL  → 'red'
    START → 'green'
    SIT   → 'orange'
    HOLD  → 'blue'
*/

UPDATE afl.player_rankings_cache
SET recommendation_color = CASE UPPER(ai_recommendation)
  WHEN 'BUY'   THEN 'green'
  WHEN 'START' THEN 'green'
  WHEN 'SELL'  THEN 'red'
  WHEN 'SIT'   THEN 'orange'
  ELSE 'blue'
END
WHERE recommendation_color IS NULL
  AND ai_recommendation IS NOT NULL;
