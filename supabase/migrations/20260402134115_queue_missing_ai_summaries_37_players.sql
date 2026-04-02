/*
  # Queue missing AI summaries for the 37 players without any content

  ## Problem
  37 players in ai.player_ai_analysis have NULL summary_short and NULL
  generated_at. These players will show blank analysis cards on all frontend
  pages. The needs_regen flag is already true for them, but the standard wave
  cron may deprioritise them if the hash-based detection does not pick them up.

  ## Fix
  Ensure all 37 players have:
  - needs_regen = true
  - input_hash = NULL (so the generate-player-ai worker picks them up)
  - needs_regen_reason set to 'missing_summary'

  This guarantees the next AI wave (every 2 minutes) will attempt generation
  for these players specifically.
*/

UPDATE ai.player_ai_analysis
SET
  needs_regen        = true,
  needs_regen_reason = 'missing_summary',
  input_hash         = NULL
WHERE summary_short IS NULL
   OR generated_at  IS NULL;
