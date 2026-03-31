
/*
  # Reset stale AI summaries and enqueue full regeneration (v2)

  ## Summary
  Clears all stale AI recommendations generated before the projection engine
  rebuild. Enqueues all active players for fresh ranking_recommendation generation.

  ## Actions
  1. Null out ai_summary / ai_updated_at in cache (marks as stale)
  2. Delete all ai_rankings_player_recos (force full regen)
  3. Delete all ai_player_analysis rows (force full regen)
  4. Reset stuck processing/failed jobs
  5. Enqueue all active players — includes prompt_key (required column)
*/

-- Step 1: Mark AI text as stale in cache
UPDATE afl.player_rankings_cache
SET
  ai_summary    = NULL,
  ai_updated_at = NULL;

-- Step 2: Clear stale AI recommendation records
DELETE FROM public.ai_rankings_player_recos;

-- Step 3: Clear stale AI player analysis records
DELETE FROM public.ai_player_analysis;

-- Step 4: Reset stuck jobs
UPDATE public.ai_generation_queue
SET status = 'pending', updated_at = NOW()
WHERE status IN ('processing', 'failed')
  AND job_type = 'ranking_recommendation';

-- Step 5: Enqueue all active players (includes prompt_key)
INSERT INTO public.ai_generation_queue (job_type, entity_type, entity_id, prompt_key, payload, status, created_at, updated_at)
SELECT
  'ranking_recommendation'              AS job_type,
  'player'                              AS entity_type,
  p.player_id::text                     AS entity_id,
  'player_ranking_recommendation_v9'    AS prompt_key,
  jsonb_build_object(
    'player_id',           p.player_id,
    'player_name',         p.player_name,
    'team',                COALESCE(f.team_name, ''),
    'position',            p.position_group,
    'projection_final',    COALESCE(f.season_avg, 50),
    'form_rating',         50,
    'consistency_score',   50,
    'value_score',         NULL,
    'price',               NULL,
    'captain_score',       50,
    'recommendation_label','HOLD'
  )                                     AS payload,
  'pending'                             AS status,
  NOW()                                 AS created_at,
  NOW()                                 AS updated_at
FROM afl.players p
LEFT JOIN afl.player_features f ON f.player_id = p.player_id
WHERE p.is_active = true
ON CONFLICT DO NOTHING;
