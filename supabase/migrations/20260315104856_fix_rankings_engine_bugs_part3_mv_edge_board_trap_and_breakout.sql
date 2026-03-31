/*
  # Fix Rankings Engine Bugs — Part 3: mv_edge_board trap threshold and logic alignment

  ## Changes

  ### Bug Fix: trap_strict uses value_score < 9.5 (should be < 95)
  value_score is on a 0–444+ scale. Threshold 9.5 only captured players with
  missing/zero prices. Fixed to 95 throughout trap_strict CTE.

  ### Logic Alignment: breakout_eligible
  Aligned to canonical `ceiling_gap >= 50` logic in both paths.
  Breakout sort updated to use upside_rating DESC (now meaningful after Part 1 fix)
  then ceiling_gap DESC as tiebreaker.

  ## Dependency
  v_admin_system_health_summary depends on mv_edge_board — we drop and recreate it.
*/

-- Drop dependent view first
DROP VIEW IF EXISTS public.v_admin_system_health_summary;

-- Rebuild mv_edge_board with fixed trap threshold
DROP MATERIALIZED VIEW IF EXISTS public.mv_edge_board;

CREATE MATERIALIZED VIEW public.mv_edge_board AS
WITH ranked AS (
  SELECT
    c.player_id::text                                                         AS player_id,
    c.player_name,
    c.team,
    c."position",
    c.projection_final::numeric                                               AS projection_final,
    c.ceiling::numeric                                                        AS ceiling_estimate,
    c.floor::numeric                                                          AS floor_estimate,
    c.upside_rating::numeric                                                  AS upside_rating,
    c.risk_rating::numeric                                                    AS risk_rating,
    c.projection_confidence::numeric                                          AS projection_confidence,
    c.captain_score::numeric                                                  AS captain_score,
    c.captain_rating,
    c.neeko_rating::numeric                                                   AS neeko_rating,
    c.price::numeric                                                          AS price,
    c.value_score::numeric                                                    AS value_score,
    c.value_tier,
    c.value_tag,
    c.consistency::numeric                                                    AS consistency_score,
    c.ai_summary,
    c.recommendation_color,
    (COALESCE(c.ceiling, 0::double precision) - COALESCE(c.projection_final, 0::double precision))::numeric AS ceiling_gap,
    ROW_NUMBER() OVER (ORDER BY c.neeko_rating   DESC NULLS LAST)            AS neeko_rating_rank,
    ROW_NUMBER() OVER (ORDER BY c.captain_score  DESC NULLS LAST)            AS captain_rank,
    ROW_NUMBER() OVER (ORDER BY (COALESCE(c.ceiling, 0::double precision) - COALESCE(c.projection_final, 0::double precision)) DESC NULLS LAST) AS ceiling_gap_rank
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
),
captain_eligible AS (
  SELECT * FROM ranked WHERE captain_score IS NOT NULL
),
-- ALIGNED: both primary and fallback now use ceiling_gap >= 50
breakout_eligible AS (
  SELECT * FROM ranked
  WHERE ceiling_gap           >= 50
  AND   projection_final      >= 50
  AND   floor_estimate        >= 25
  AND   projection_confidence >= 40
  AND   risk_rating           <= 75
  AND   captain_rank          >  5
),
-- FIXED: value_score < 95 (was incorrectly 9.5 — 10x scale error)
trap_strict AS (
  SELECT * FROM ranked
  WHERE neeko_rating_rank <= 100
  AND (risk_rating >= 50 OR value_score < 95)
  AND (
    CASE WHEN risk_rating           >= 55 THEN 1 ELSE 0 END +
    CASE WHEN consistency_score     <= 50 THEN 1 ELSE 0 END +
    CASE WHEN value_score           <  95 THEN 1 ELSE 0 END +
    CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END
  ) >= 2
),
trap_fallback AS (
  SELECT * FROM ranked
  WHERE neeko_rating_rank <= 100
  AND player_name NOT IN (SELECT player_name FROM trap_strict)
  ORDER BY risk_rating DESC NULLS LAST, value_score ASC
),
trap_combined AS (
  SELECT *, 1 AS trap_priority FROM trap_strict
  UNION ALL
  SELECT *, 2 AS trap_priority FROM trap_fallback
),
trap_final AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
    ) AS trap_rn
  FROM trap_combined
),
sectioned AS (
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    -- UPDATED: sort by upside_rating (now meaningful) then ceiling_gap
    ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
  FROM breakout_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn AS section_rank
  FROM trap_final
  WHERE trap_rn <= 5
)
SELECT
  player_id, player_name, team, "position",
  section, section_rank,
  projection_final, ceiling_estimate, floor_estimate,
  upside_rating, risk_rating, projection_confidence,
  captain_score, captain_rating, neeko_rating,
  price, value_score, value_tag, ai_summary, recommendation_color,
  now() AS refreshed_at
FROM sectioned
WHERE section_rank <= 5;

CREATE UNIQUE INDEX IF NOT EXISTS mv_edge_board_player_section_idx
  ON public.mv_edge_board (player_id, section);

-- Recreate v_admin_system_health_summary (identical logic, just re-established after mv rebuild)
CREATE OR REPLACE VIEW public.v_admin_system_health_summary AS
SELECT
  (SELECT max(started_at) FROM pipeline_runs) AS last_pipeline_run,
  (SELECT status FROM pipeline_runs ORDER BY started_at DESC LIMIT 1) AS pipeline_status,
  (SELECT COUNT(*)::integer FROM afl.player_rankings_cache) AS rankings_cache_rows,
  (SELECT max(cached_at) FROM afl.player_rankings_cache) AS rankings_cache_refreshed_at,
  (SELECT COUNT(*)::integer FROM ai_player_content) AS ai_content_rows,
  (SELECT COUNT(*)::integer FROM ai_player_content WHERE summary IS NOT NULL) AS ai_content_with_summary,
  (SELECT COUNT(*)::integer FROM ai_rankings_player_recos WHERE recommendation_long IS NOT NULL AND recommendation_long <> 'Model analysis is currently generating.') AS reco_rows,
  (SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'pending') AS queue_pending,
  (SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'complete') AS queue_complete,
  (SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'failed') AS queue_failed,
  (SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'pending' AND job_type = 'ranking_recommendation') AS reco_queue_pending,
  (SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'pending' AND job_type = 'player_analysis') AS analysis_queue_pending,
  (SELECT COUNT(*)::integer FROM ai_player_runs WHERE status = 'pending') AS player_runs_pending,
  (SELECT COUNT(*)::integer FROM ai_player_runs WHERE status = 'failed') AS player_runs_failed,
  (SELECT COUNT(*)::integer FROM mv_edge_board) AS edge_board_rows,
  (SELECT COUNT(*) FILTER (WHERE section = 'captain') FROM mv_edge_board)::integer AS edge_board_captains,
  (SELECT COUNT(*) FILTER (WHERE section = 'breakout') FROM mv_edge_board)::integer AS edge_board_breakouts,
  (SELECT COUNT(*) FILTER (WHERE section = 'trap') FROM mv_edge_board)::integer AS edge_board_traps,
  (SELECT max(refreshed_at) FROM mv_edge_board) AS edge_board_refreshed_at,
  (SELECT COUNT(DISTINCT player_id)::integer FROM projection_accuracy) AS accuracy_players,
  (SELECT ROUND(AVG(ABS(projected_score - actual_score)), 1) FROM projection_accuracy WHERE actual_score IS NOT NULL AND season = 2026) AS accuracy_avg_error,
  (SELECT max(round_number) FROM projection_accuracy WHERE season = 2026) AS accuracy_latest_round,
  (SELECT active FROM cron.job WHERE jobname = 'afl_worker_ingestion' LIMIT 1) AS ingestion_cron_active,
  (SELECT active FROM cron.job WHERE jobname = 'afl_processing_pipeline' LIMIT 1) AS processing_cron_active,
  (SELECT active FROM cron.job WHERE jobname = 'neeko_ai_pipeline_daily' LIMIT 1) AS ai_cron_active,
  (SELECT COUNT(*)::integer FROM afl.players p WHERE NOT EXISTS (SELECT 1 FROM ai_player_content c WHERE c.player_id = p.player_id)) AS players_missing_ai_content,
  (SELECT COUNT(*)::integer FROM afl.players p WHERE NOT EXISTS (SELECT 1 FROM afl.player_rankings_cache rc WHERE rc.player_id = p.player_id)) AS players_missing_from_cache,
  (SELECT max(created_at) FROM market.market_watch_snapshot) AS market_watch_last_refresh,
  (SELECT COUNT(*)::integer FROM system_logs WHERE log_level IN ('error', 'warn') AND created_at > now() - interval '24 hours') AS recent_error_count,
  (SELECT max(created_at) FROM system_logs) AS system_logs_last_event_at,
  (SELECT max(updated_at) FROM ai_generation_queue WHERE status = 'complete') AS ai_worker_last_run;
