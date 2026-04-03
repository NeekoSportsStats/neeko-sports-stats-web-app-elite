
/*
  # Flag 8 genuine trade-word AI summary violations for regeneration

  These 8 players have AI-generated summary_short text that explicitly contains
  trade action words (buy, sell, hold as recommendations). They need their AI
  summaries regenerated with the current prompt that excludes such language.

  Action: Set needs_regen = true in ai.player_ai_analysis for these players
  so the next AI pipeline pass regenerates their summaries.
*/

UPDATE ai.player_ai_analysis
SET 
  needs_regen = true,
  needs_regen_reason = 'summary_short contains explicit trade action words (buy/sell/hold) — violates content rules'
WHERE player_id IN (
  SELECT player_id 
  FROM afl.player_rankings_cache
  WHERE ai_validation_passed = false
);
