
/*
  # Enqueue All Players for AI Recommendation Regeneration

  ## Summary
  Now that:
  1. All stale reco rows are cleared
  2. All stale queue jobs are cleared
  3. mv_ai_player_ai_inputs is verified correct (player_id matches player_name)
  4. v_ai_rankings_generation_queue view now exists

  This migration calls public.enqueue_ranking_reco_jobs() to re-populate the
  queue for all 716 active players using the correct MV data.

  The condition in enqueue_ranking_reco_jobs checks:
  - stored_input_hash IS DISTINCT FROM current_input_hash (all rows qualify since recos are empty)
  - OR no existing reco row (all rows qualify since we truncated recos)
  - AND no existing pending/processing queue job (queue is also cleared)

  All 716 players will be enqueued.
*/

SELECT public.enqueue_ranking_reco_jobs();
