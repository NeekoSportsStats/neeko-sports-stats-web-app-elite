/*
  # Fix: Backfill afl.player_rankings_cache AI columns from ai.player_ai_analysis

  ## Problem
  ai.player_ai_analysis has 687 rows with summary_long and summary_short content.
  afl.player_rankings_cache has summary_long = 0/609 (all NULL - wiped by pipeline bug).

  ## Fix
  Sync all AI content from ai.player_ai_analysis into afl.player_rankings_cache
  for all players that have generated content (generated_at IS NOT NULL).
*/

-- Backfill all AI content from ai.player_ai_analysis → afl.player_rankings_cache
UPDATE afl.player_rankings_cache rc
SET
  summary_short        = aa.summary_short,
  summary_long         = aa.summary_long,
  recommendation_short = aa.summary_short,
  recommendation_why   = aa.summary_long,
  ai_summary           = aa.summary_long,
  ai_generated_at      = aa.generated_at,
  ai_updated_at        = aa.generated_at,
  recommendation_color = CASE
    WHEN aa.recommendation ILIKE '%strong buy%' OR aa.recommendation = 'STRONG_UP'  THEN 'green'
    WHEN aa.recommendation ILIKE '%buy%'        OR aa.recommendation = 'UP'          THEN 'green'
    WHEN aa.recommendation ILIKE '%sell%'       OR aa.recommendation = 'STRONG_DOWN' THEN 'red'
    WHEN aa.recommendation ILIKE '%down%'       OR aa.recommendation = 'DOWN'        THEN 'orange'
    ELSE 'gray'
  END
FROM ai.player_ai_analysis aa
WHERE aa.player_id = rc.player_id
  AND aa.generated_at IS NOT NULL
  AND aa.summary_long IS NOT NULL;

-- Reset needs_regen for players with fresh content (generated within 7 days)
UPDATE ai.player_ai_analysis
SET needs_regen = false,
    needs_regen_reason = NULL
WHERE generated_at IS NOT NULL
  AND summary_long IS NOT NULL
  AND needs_regen = true
  AND generated_at > now() - interval '7 days';

-- Log the backfill result
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
VALUES (
  'info',
  'pipeline_fix',
  'backfill',
  'Backfilled AI content to rankings cache from ai.player_ai_analysis',
  jsonb_build_object(
    'fix', 'fix_pipeline_step3_backfill',
    'applied_at', now()
  )
);
