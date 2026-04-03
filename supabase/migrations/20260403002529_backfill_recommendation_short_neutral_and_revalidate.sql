
/*
  # Backfill neutral recommendation_short for 48 records with trade words

  Updates the hardcoded recommendation_short text for all existing cache records
  that still contain sell/buy/hold language, then re-evaluates ai_validation_passed.
*/

UPDATE afl.player_rankings_cache
SET recommendation_short = CASE
  WHEN ai_recommendation = 'SELL' AND value_score <= -10 THEN 'Overpriced — price likely to drop'
  WHEN ai_recommendation = 'SELL' AND value_score <= -6  THEN 'Below value — consider trading'
  WHEN ai_recommendation = 'SELL'                        THEN 'Not scoring to price — risk elevated'
  WHEN ai_recommendation = 'BUY'                         THEN 'Strong value signal — price rising'
  ELSE 'Performing to price — monitor'
END
WHERE recommendation_short ILIKE '%buy%'
   OR recommendation_short ILIKE '%sell%'
   OR recommendation_short ILIKE '%hold%';

UPDATE afl.player_rankings_cache
SET ai_validation_passed = (
  summary_short IS NOT NULL
  AND ai_generated_at IS NOT NULL
  AND summary_short NOT ILIKE '%buy%'
  AND summary_short NOT ILIKE '%sell%'
  AND summary_short NOT ILIKE '%hold%'
  AND recommendation_short NOT ILIKE '%buy%'
  AND recommendation_short NOT ILIKE '%sell%'
  AND recommendation_short NOT ILIKE '%hold%'
);
