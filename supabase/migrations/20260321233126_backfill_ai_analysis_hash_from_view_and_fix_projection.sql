/*
  # Backfill ai.player_ai_analysis — align input_hash from view and fix stored_projection

  ## Problem
  The previous backfill computed hashes without signal_count (from v_player_signals_master),
  so hashes still don't match what v_ai_player_analysis_input computes. Additionally,
  stored_projection is NULL on many rows, causing the projection-diff check to fire.

  ## Fix
  1. Update input_hash directly from v_ai_player_analysis_input.input_hash
     (the single source of truth — this is the exact value the needs_regen check uses)
  2. Update stored_projection from afl.player_rankings_cache.projection_final
     (ensures projection diff check won't fire on unchanged data)

  ## Effect
  After this migration, players with existing AI content will have needs_regen = FALSE.
  Only players with genuinely changed input data will be queued — eliminating the
  infinite regen loop.
*/

UPDATE ai.player_ai_analysis a
SET
  input_hash = v.input_hash,
  stored_projection = c.projection_final
FROM public.v_ai_player_analysis_input v,
     afl.player_rankings_cache c
WHERE v.player_id = a.player_id
  AND c.player_id = a.player_id;
