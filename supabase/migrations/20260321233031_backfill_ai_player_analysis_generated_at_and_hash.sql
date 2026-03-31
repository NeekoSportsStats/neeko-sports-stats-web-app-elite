/*
  # Backfill ai.player_ai_analysis — stamp generated_at and input_hash

  ## Problem
  724 existing rows in ai.player_ai_analysis have generated_at = NULL and
  input_hash = NULL. This causes needs_regen = TRUE permanently for all players,
  creating an infinite regen loop.

  ## Fix
  1. Stamp generated_at = now() on all rows where it is NULL
  2. Compute and set input_hash from the current rankings cache data so that
     the hash in ai.player_ai_analysis matches what v_ai_player_analysis_input
     computes — breaking the infinite loop immediately
  3. Players with existing summary_short/summary_long get their hash aligned
     to the current cache state so they won't be re-queued unnecessarily

  ## Notes
  - Only updates rows where generated_at IS NULL (safe to re-run)
  - Hash formula must match v_ai_player_analysis_input exactly:
    md5(projection_final || confidence || value_score || games_played ||
        risk_rating || neeko_rating_scaled || ai_recommendation || signal_count)
*/

UPDATE ai.player_ai_analysis a
SET
  generated_at = now(),
  input_hash = COALESCE(
    a.input_hash,
    (
      SELECT md5(
        COALESCE(c.projection_final::text, '') ||
        COALESCE(c.projection_confidence::text, '') ||
        COALESCE(c.value_score::text, '') ||
        COALESCE(c.games_played::text, '') ||
        COALESCE(c.risk_rating::text, '') ||
        COALESCE(c.neeko_rating_scaled::text, '') ||
        COALESCE(c.ai_recommendation, '') ||
        '0'
      )
      FROM afl.player_rankings_cache c
      WHERE c.player_id = a.player_id
      LIMIT 1
    )
  )
WHERE a.generated_at IS NULL;
