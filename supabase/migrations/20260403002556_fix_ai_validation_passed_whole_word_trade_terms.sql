
/*
  # Fix ai_validation_passed — use whole-word matching for trade terms

  ## Problem
  The ILIKE '%hold%' pattern falsely flags AI summaries that use "holds" as a verb
  (e.g. "floor holds at 68") instead of "HOLD" as a trade action recommendation.

  ## Fix
  Replace broad substring matching with word-boundary patterns using regex (~*).
  Trade word violations must be standalone words: ' buy ', ' sell ', ' hold '
  (with surrounding spaces or at start/end of string).

  This correctly passes summaries like "floor holds at 68" while still catching
  explicit trade recommendations like "making him a hold candidate".
*/

UPDATE afl.player_rankings_cache
SET ai_validation_passed = (
  summary_short IS NOT NULL
  AND ai_generated_at IS NOT NULL
  AND summary_short !~* '\mbuy\M'
  AND summary_short !~* '\msell\M'
  AND summary_short !~* '\mhold\M'
);
