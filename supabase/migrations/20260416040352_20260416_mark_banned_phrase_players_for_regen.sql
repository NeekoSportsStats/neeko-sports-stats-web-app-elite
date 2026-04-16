/*
  # Mark banned-phrase players for AI regeneration

  29 players in afl.player_rankings_cache still have ai_validation_passed = false
  because their AI content contains genuinely banned phrases (could, might, may, this round, overall,).
  These need to be regenerated. Mark them needs_regen = true in ai.player_ai_analysis so
  the wave cron picks them up.
*/

UPDATE ai.player_ai_analysis aa
SET needs_regen = true,
    needs_regen_reason = 'validation_failed_banned_phrase'
FROM afl.player_rankings_cache rc
WHERE rc.player_id = aa.player_id
  AND rc.ai_validation_passed = false
  AND rc.summary_long IS NOT NULL
  AND rc.summary_long != ''
  AND (rc.games_played IS NULL OR rc.games_played > 0);
