/*
  # Backfill recommendation_color in ai_rankings_player_recos

  ## Summary
  477 of 769 rows had NULL recommendation_color despite having a known label.
  The color mapping is deterministic based on recommendation_label:
  
  BUY      → green
  START    → green
  HOLD     → yellow
  SIT      → orange
  SELL     → red
  CAPTAIN  → gold

  Updates all NULL color rows using this mapping.
  Does NOT touch rows that already have a color value.
*/

UPDATE public.ai_rankings_player_recos
SET recommendation_color = CASE recommendation_label
  WHEN 'BUY'     THEN 'green'
  WHEN 'START'   THEN 'green'
  WHEN 'HOLD'    THEN 'yellow'
  WHEN 'SIT'     THEN 'orange'
  WHEN 'SELL'    THEN 'red'
  WHEN 'CAPTAIN' THEN 'gold'
  ELSE 'grey'
END
WHERE recommendation_color IS NULL
  AND recommendation_label IS NOT NULL;
