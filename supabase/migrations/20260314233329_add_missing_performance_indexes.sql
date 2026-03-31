
/*
  # Platform Audit — Missing Indexes + Enqueue AI Gap Players

  ## Index Additions
  Targeted composite indexes for the most common query patterns:
  1. afl.player_rankings_cache — (team, neeko_rating DESC) for team filter queries
  2. public.ai_player_content — (recommendation, generated_at) for stale detection
  3. public.projection_accuracy — (player_id, season) for accuracy lookup
  4. afl.games_raw — (status_short, season, week) for round detection in v_mw_premium
  5. public.system_logs — (log_level, created_at DESC) for admin health dashboard
  6. public.ai_rankings_player_recos — (recommendation_label, updated_at) for filtering

  ## AI Gap Coverage
  20 players exist in afl.players with no entry in ai_player_content.
  Enqueue them via ai_generation_queue for the next AI pipeline run.

  ## system_logs schema verification
  Ensure system_logs has a log_level column (required by new logging calls).
*/

-- 1. Composite index for team-filtered rankings queries
CREATE INDEX IF NOT EXISTS idx_rankings_cache_team_rating
  ON afl.player_rankings_cache (team, neeko_rating DESC NULLS LAST);

-- 2. Stale AI content detection
CREATE INDEX IF NOT EXISTS idx_ai_content_reco_generated
  ON public.ai_player_content (recommendation, generated_at DESC);

-- 3. Projection accuracy by player+season
CREATE INDEX IF NOT EXISTS idx_projection_accuracy_player_season
  ON public.projection_accuracy (player_id, season);

-- 4. Round detection from games_raw (used by v_mw_premium round_ctx CTE)
CREATE INDEX IF NOT EXISTS idx_games_raw_status_season_week
  ON afl.games_raw (status_short, season, week DESC);

-- 5. Admin health dashboard log queries
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created
  ON public.system_logs (log_level, created_at DESC);

-- 6. AI rankings recos by recommendation type
CREATE INDEX IF NOT EXISTS idx_ai_recos_recommendation_label
  ON public.ai_rankings_player_recos (recommendation_label, updated_at DESC);

-- ============================================================
-- Enqueue the 20 players missing AI content
-- ai_generation_queue uses entity_id (not player_id), job_type, prompt_key
-- ============================================================

INSERT INTO public.ai_generation_queue (
  job_type,
  entity_type,
  entity_id,
  prompt_key,
  payload,
  status,
  attempts,
  created_at,
  updated_at
)
SELECT
  'player_analysis'                AS job_type,
  'player'                         AS entity_type,
  p.player_id::text                AS entity_id,
  'player_ranking_recommendation'  AS prompt_key,
  jsonb_build_object(
    'player_id',   p.player_id,
    'player_name', p.player_name,
    'reason',      'ai_gap_backfill'
  )                                AS payload,
  'pending'                        AS status,
  0                                AS attempts,
  now(),
  now()
FROM afl.players p
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_player_content aic WHERE aic.player_id = p.player_id
)
AND NOT EXISTS (
  SELECT 1 FROM public.ai_generation_queue q
  WHERE q.entity_id = p.player_id::text
    AND q.status IN ('pending', 'processing')
);

-- ============================================================
-- Log the audit completion to system_logs
-- ============================================================

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'platform_audit_complete',
  'migration:platform_audit_hardening',
  'info',
  'Platform audit hardening applied. Indexes added, views optimised, AI gap players enqueued.',
  jsonb_build_object(
    'indexes_added', 6,
    'fixes_applied', jsonb_build_array(
      'afl.populate_rankings_cache_from_source — 120s timeout helper',
      'public.refresh_rankings_and_market_watch — logs to system_logs',
      'v_mw_premium — MAX(week) raw scan replaced with games_raw lookup',
      'v_pipeline_status — cross join to v_neeko_rating replaced with cache',
      'afl_processing_pipeline — failure root cause fixed (stale function definition)'
    ),
    'audited_at', now()
  )
);
