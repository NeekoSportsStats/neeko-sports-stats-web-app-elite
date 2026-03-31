
/*
  # Clear Stale AI Recommendation Data

  ## Summary
  All 769 rows in public.ai_rankings_player_recos contain AI text for the wrong
  players. The root cause was a stale materialized view (mv_ai_player_ai_inputs)
  that had incorrect player_id → player_name mappings when the generation queue
  was bulk-populated on 2026-03-08. The MV is now correct.

  ## Actions
  1. TRUNCATE public.ai_rankings_player_recos — removes all 769 incorrect rows
  2. DELETE stale ranking_recommendation jobs from ai_generation_queue — all 769
     jobs were created from the stale MV with wrong names; they are all complete
     so deleting is safe and necessary before re-enqueueing

  ## Safety
  - No other tables are touched
  - No auth, stripe, or user tables affected
  - player_rankings_cache will show NULL AI fields until regeneration completes
    (this is correct and expected)
*/

TRUNCATE TABLE public.ai_rankings_player_recos;

DELETE FROM public.ai_generation_queue
WHERE job_type = 'ranking_recommendation';
