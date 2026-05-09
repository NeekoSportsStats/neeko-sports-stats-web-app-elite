/*
  # Mark Round 9 Players for AI Regeneration — Post-Ingestion Recovery

  ## Problem
  Last night's Round 9 ingestion updated stats for 363 players (game_ids 3417–3423,
  season=2026) but zero Player AI records were regenerated after ingestion.

  Root cause: run_neeko_ai_enqueue's stale-detection step only fires when
  input_hash IS NOT NULL — but all 594 rows have input_hash IS NULL, so the
  hash-diff check was silently skipped, and the pipeline reported stale=0.

  ## What This Migration Does

  1. Seeds ai.player_ai_analysis rows for the 31 Round 9 players with no record.
  2. Marks all 363 Round 9 FT players needs_regen=true with reason
     'post_ingestion_round_9_stats_changed'.
  3. Clears generated_at and input_hash on stale rows so the wave function
     treats them as ungenerated and processes them first.

  ## Scope
  - Only players from 2026 season Round 9 completed (FT) games.
  - Only players with games_played > 0 in 2026.
  - Does not touch any other player AI rows.
  - Does not alter any pipeline, cron, or edge function.
*/

-- Step 1: Seed missing ai.player_ai_analysis rows for Round 9 players
-- (the 31 players with no record at all)
INSERT INTO ai.player_ai_analysis (player_id, needs_regen, needs_regen_reason)
SELECT DISTINCT pg.player_id,
  true,
  'post_ingestion_round_9_stats_changed'
FROM afl.player_games pg
JOIN afl.games_raw g ON g.game_id = pg.game_id
WHERE pg.season = 2026
  AND pg.week = 9
  AND g.status_short = 'FT'
  AND pg.player_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ai.player_ai_analysis aa WHERE aa.player_id = pg.player_id
  )
ON CONFLICT (player_id) DO NOTHING;

-- Step 2: Mark all 363 Round 9 FT players as needs_regen=true
-- For the 318 stale players: clear generated_at and input_hash so the
-- wave function treats them as fresh-to-generate rather than skipping.
-- For the 14 cleared/no-summary players: preserve the record, just ensure flag is set.
UPDATE ai.player_ai_analysis aa
SET
  needs_regen        = true,
  needs_regen_reason = 'post_ingestion_round_9_stats_changed',
  input_hash         = NULL,
  generated_at       = NULL
WHERE aa.player_id IN (
  SELECT DISTINCT pg.player_id
  FROM afl.player_games pg
  JOIN afl.games_raw g ON g.game_id = pg.game_id
  WHERE pg.season = 2026
    AND pg.week = 9
    AND g.status_short = 'FT'
    AND pg.player_id IS NOT NULL
)
AND aa.summary_short IS NOT NULL;

-- Step 3: For the 14 cleared/no-summary players already flagged needs_regen=true,
-- ensure the reason is updated to reflect this recovery cycle.
UPDATE ai.player_ai_analysis aa
SET
  needs_regen        = true,
  needs_regen_reason = 'post_ingestion_round_9_stats_changed'
WHERE aa.player_id IN (
  SELECT DISTINCT pg.player_id
  FROM afl.player_games pg
  JOIN afl.games_raw g ON g.game_id = pg.game_id
  WHERE pg.season = 2026
    AND pg.week = 9
    AND g.status_short = 'FT'
    AND pg.player_id IS NOT NULL
)
AND aa.summary_short IS NULL
AND aa.needs_regen = true;
