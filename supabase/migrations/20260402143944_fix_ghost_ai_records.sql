/*
  # Fix AI Ghost Records Poisoning Health Checks

  ## Summary
  44 orphaned rows in `ai.player_ai_analysis` had `needs_regen = true` with no matching
  player in either `afl.player_rankings_cache` or `afl.mv_player_projection`.

  These ghost records caused the AI health guard to fire a full recovery wave on every
  pipeline run, wasting compute and producing misleading health dashboard metrics.

  ## Fix
  - Set `needs_regen = false` on all ghost rows
  - Set `needs_regen_reason` to document why they were cleared
  - These are safely reversible — any active player will have their `needs_regen` reset
    to true by the normal pipeline if genuine regen is needed

  ## Tables Modified
  - `ai.player_ai_analysis`: ghost rows marked as not needing regen
*/

UPDATE ai.player_ai_analysis
SET
  needs_regen = false,
  needs_regen_reason = 'deactivated: no projection or cache entry found'
WHERE needs_regen = true
  AND input_hash IS NULL
  AND player_id NOT IN (
    SELECT player_id FROM afl.player_rankings_cache WHERE player_id IS NOT NULL
  )
  AND player_id NOT IN (
    SELECT player_id FROM afl.mv_player_projection WHERE player_id IS NOT NULL
  );
