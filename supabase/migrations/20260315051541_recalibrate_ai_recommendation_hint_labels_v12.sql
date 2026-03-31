/*
  # Recalibrate ai_recommendation hint labels in player_rankings_cache

  ## Summary
  Updates the ai_recommendation column in afl.player_rankings_cache to use the
  new v12 threshold logic. This column is the {LABEL} hint passed to the OpenAI
  prompt. Previously 92% of players had HOLD — this corrects the hint labels so
  the AI receives accurate signal context.

  ## New label logic (normalized value_score, 100 = fair value):
    BUY:   value_score >= 120 AND projection_final >= 85
    START: value_score >= 110 AND projection_final >= 72
    HOLD:  value_score 90–110
    SIT:   value_score 75–90
    SELL:  value_score < 75

  ## Also updates recommendation_color to match:
    BUY   → green
    START → teal
    HOLD  → grey
    SIT   → yellow
    SELL  → red
*/

UPDATE afl.player_rankings_cache
SET
  ai_recommendation = CASE
    WHEN price IS NULL OR price = 0               THEN 'HOLD'
    WHEN value_score >= 120 AND projection_final >= 85 THEN 'BUY'
    WHEN value_score >= 110 AND projection_final >= 72 THEN 'START'
    WHEN value_score >= 90  AND value_score < 110      THEN 'HOLD'
    WHEN value_score >= 75  AND value_score < 90       THEN 'SIT'
    ELSE 'SELL'
  END,
  recommendation_color = CASE
    WHEN price IS NULL OR price = 0               THEN 'grey'
    WHEN value_score >= 120 AND projection_final >= 85 THEN 'green'
    WHEN value_score >= 110 AND projection_final >= 72 THEN 'teal'
    WHEN value_score >= 90  AND value_score < 110      THEN 'grey'
    WHEN value_score >= 75  AND value_score < 90       THEN 'yellow'
    ELSE 'red'
  END;
