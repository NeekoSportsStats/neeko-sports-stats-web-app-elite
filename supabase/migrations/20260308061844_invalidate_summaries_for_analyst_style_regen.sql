/*
  # Invalidate AI Summaries for Analyst Style Regeneration

  ## Summary
  Clears recommendation_long (and recommendation_short where it exists) from
  ai_rankings_player_recos so the AI worker regenerates them with the new
  v11 analyst-style prompt.

  Also resets the corresponding ai_generation_queue jobs back to "pending"
  so the worker picks them up immediately.

  ## Safety
  - Only clears the text fields — player_id, recommendation_label, recommendation_color,
    and all numeric scores are preserved
  - No data is deleted
*/

-- ─── 1. Clear stale recommendation text in ai_rankings_player_recos ──────────

UPDATE public.ai_rankings_player_recos
SET
  recommendation_long  = NULL,
  recommendation_short = NULL,
  input_hash           = NULL
WHERE season = 2026
  AND recommendation_long IS NOT NULL;

-- ─── 2. Reset the corresponding queue jobs to pending ─────────────────────────
-- Targets all ranking reco jobs that are complete so they are re-queued
-- The enqueue function will detect the NULL input_hash and re-enqueue them

UPDATE public.ai_generation_queue
SET
  status     = 'pending',
  attempts   = 0,
  processed_at = NULL,
  updated_at = now()
WHERE job_type   = 'ranking_reco'
  AND status     = 'complete';
