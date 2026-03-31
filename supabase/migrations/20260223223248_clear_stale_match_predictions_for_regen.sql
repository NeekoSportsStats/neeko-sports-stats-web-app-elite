/*
  # Clear stale match predictions for regeneration

  ## Summary
  Clears the old fantasy-score based rows from ai_match_predictions
  so the edge function can write fresh true-game-score predictions.
  Only removes rows for the 2026 upcoming matches (rounds 0 and 1).
  Historical rows are untouched.
*/
DELETE FROM afl.ai_match_predictions
WHERE season = 2026
  AND round_number IN (0, 1);
