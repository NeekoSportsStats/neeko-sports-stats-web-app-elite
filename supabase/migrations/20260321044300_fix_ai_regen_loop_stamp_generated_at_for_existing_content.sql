/*
  # Fix AI Regen Loop - Stamp generated_at for Rows With Existing Content

  ## Problem
  Migration 20260319231757 set generated_at = NULL on all ai.player_ai_analysis rows
  to force a v5 prompt regen. The edge function generate-player-ai re-generated
  summaries for 564 of 687 players, but the resulting rows had their generated_at
  cleared by that migration and never re-stamped (the writeback correctly called
  upsert_player_ai_analysis which sets generated_at = now(), but a subsequent run
  of run_neeko_ai_enqueue was clearing input_hash and generated_at again before
  the next cycle could confirm them).

  The net result: v_ai_player_analysis_input flagged ALL 687 players as needs_regen
  every single cycle because generated_at IS NULL triggered the regen condition.

  ## Fix
  For the 564 rows that have real summary content (non-null, non-empty summary_short)
  but NULL generated_at:
  - Set generated_at = current timestamp to mark them as successfully generated
  - Set input_hash = current hash from v_ai_player_analysis_input so future
    hash comparison is stable

  The 123 rows with no content correctly remain needs_regen = true and will be
  picked up by the next AI worker run.

  ## Result After Fix
  - 564 players: clean (needs_regen = false)
  - 123 players: genuinely missing content (needs_regen = true, will regenerate)
  - Loop broken: same 564 will NOT be re-flagged on next cycle unless input changes
*/

UPDATE ai.player_ai_analysis a
SET
  generated_at = now(),
  input_hash   = v.input_hash
FROM public.v_ai_player_analysis_input v
WHERE a.player_id    = v.player_id
  AND a.summary_short IS NOT NULL
  AND a.summary_short != ''
  AND a.generated_at  IS NULL;
