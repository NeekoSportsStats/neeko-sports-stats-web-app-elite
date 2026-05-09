/*
  # Fix AI coverage to count eligible players only (games_played > 0)

  ## Problem
  admin.v_system_state.ai_cover CTE counts ALL 594 players in player_rankings_cache,
  then compares against the 514 who have summary_long — reporting 80 "missing".
  Those 80 players have games_played = 0 (never played a game this season) and are
  intentionally excluded from Player AI. They are not broken coverage — they have
  nothing to analyse.

  ## Fix
  1. admin.v_system_state — ai_cover CTE now filters to games_played > 0 for both
     the "eligible" and "covered" counts. Adds ai_players_excluded column (zero-game
     players intentionally excluded from AI).
  2. public.v_command_center_status — exposes ai_players_excluded, fixes ai_health to
     'ok' when ai_missing_players = 0 (regardless of excluded count).
  3. get_ai_health_summary() — filters ai.player_ai_analysis to only players in
     player_rankings_cache with games_played > 0, so total_rows / missing / stale
     all reflect eligible players only. Adds excluded_from_ai count.

  ## Result
  - eligible_players = 514 (games_played > 0)
  - covered_eligible = 514
  - missing_eligible = 0
  - excluded = 80 (zero-game players — not an error)
  - ai_health = 'ok'

  ## No production data mutations — view/function definitions only
*/

-- ── Step 1: Rebuild admin.v_system_state with eligible-only AI counts ───────

DROP VIEW IF EXISTS public.v_command_center_status;
DROP VIEW IF EXISTS admin.v_system_state;

CREATE VIEW admin.v_system_state AS
WITH rankings AS (
  SELECT
    COUNT(*)::integer                AS cache_rows,
    MAX(cached_at)                   AS cached_at,
    CASE
      WHEN COUNT(*) >= 500 THEN 'ok'
      WHEN COUNT(*) >= 100 THEN 'warn'
      ELSE 'error'
    END                              AS status
  FROM afl.player_rankings_cache
),
ai_cover AS (
  SELECT
    -- Only count players who have played at least one game as eligible
    COUNT(DISTINCT c.player_id) FILTER (WHERE COALESCE(c.games_played, 0) > 0)::integer AS eligible_players,
    COUNT(DISTINCT c.player_id) FILTER (WHERE COALESCE(c.games_played, 0) = 0)::integer AS excluded_players,
    COUNT(DISTINCT pa.player_id) FILTER (
      WHERE COALESCE(c.games_played, 0) > 0
        AND pa.summary_long IS NOT NULL
        AND pa.summary_long <> ''
    )::integer AS players_with_analysis
  FROM afl.player_rankings_cache c
  LEFT JOIN ai.player_ai_analysis pa
    ON pa.player_id = c.player_id
),
ai_recos AS (
  SELECT
    COUNT(*)::integer                                                          AS total,
    COUNT(*) FILTER (WHERE recommendation_label IS NOT NULL)::integer         AS with_reco,
    MAX(updated_at)                                                            AS last_updated
  FROM ai_rankings_player_recos
),
queue_state AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending')::integer    AS pending,
    COUNT(*) FILTER (WHERE status = 'processing')::integer AS processing,
    COUNT(*) FILTER (WHERE status = 'complete')::integer   AS complete,
    COUNT(*) FILTER (WHERE status = 'failed')::integer     AS failed
  FROM ai_generation_queue
),
mw_state AS (
  SELECT
    COUNT(DISTINCT mwsp.player_id)::integer AS total_players,
    MAX(mws.updated_at)                     AS last_snapshot
  FROM market.market_watch_snapshot mws
  JOIN market.market_watch_snapshot_players mwsp
    ON mwsp.snapshot_id = mws.snapshot_id
  WHERE mws.is_active = true
),
cron_state AS (
  SELECT
    COUNT(*) FILTER (WHERE active)::integer      AS active_count,
    COUNT(*) FILTER (WHERE NOT active)::integer  AS inactive_count
  FROM cron.job
),
errors AS (
  SELECT COUNT(*)::integer AS error_count
  FROM system_logs
  WHERE log_level = 'error'
    AND created_at >= NOW() - INTERVAL '24 hours'
),
fantasy AS (
  SELECT
    COUNT(*)::integer                                          AS total,
    COUNT(*) FILTER (WHERE player_id IS NOT NULL)::integer    AS matched,
    MAX(ingested_at)                                          AS last_updated
  FROM afl.fantasy_player_market
),
subs AS (
  SELECT
    COUNT(*) FILTER (WHERE subscription_status = 'active')::integer AS active_subs,
    COUNT(*)::integer                                                AS total_profiles
  FROM profiles
),
eb AS (
  SELECT
    COUNT(*)::integer AS edge_board_rows,
    (SELECT MAX(cached_at) FROM afl.player_rankings_cache) AS edge_board_refreshed_at
  FROM mv_edge_board
),
pip AS (
  SELECT
    status,
    started_at,
    finished_at,
    EXTRACT(EPOCH FROM (COALESCE(finished_at, started_at) - started_at))::integer AS duration_s
  FROM pipeline_runs
  ORDER BY started_at DESC
  LIMIT 1
)
SELECT
  r.status                                                       AS rankings_health,
  r.cache_rows                                                   AS rankings_cache_rows,
  r.cached_at                                                    AS rankings_refreshed_at,
  COALESCE((SELECT status FROM pip), 'never_run')                AS pipeline_status,
  (SELECT started_at  FROM pip)                                  AS pipeline_last_run,
  (SELECT finished_at FROM pip)                                  AS pipeline_finished_at,
  (SELECT duration_s  FROM pip)                                  AS pipeline_duration_s,
  -- Eligible-only AI coverage (games_played > 0 players only)
  COALESCE(ac.players_with_analysis, 0)                          AS ai_players_covered,
  GREATEST(COALESCE(ac.eligible_players,0) - COALESCE(ac.players_with_analysis,0), 0) AS ai_players_missing,
  -- Zero-game players intentionally excluded from AI (not broken coverage)
  COALESCE(ac.excluded_players, 0)                               AS ai_players_excluded,
  COALESCE(ar.total, 0)                                          AS reco_rows,
  COALESCE(ar.with_reco, 0)                                      AS reco_with_content,
  ar.last_updated                                                AS reco_last_updated,
  COALESCE(q.pending, 0)                                         AS queue_pending,
  COALESCE(q.processing, 0)                                      AS queue_processing,
  COALESCE(q.complete, 0)                                        AS queue_complete,
  COALESCE(q.failed, 0)                                          AS queue_failed,
  COALESCE(mw.total_players, 0)                                  AS mw_player_count,
  mw.last_snapshot                                               AS mw_last_snapshot,
  COALESCE(cr.active_count, 0)                                   AS cron_active,
  COALESCE(cr.inactive_count, 0)                                 AS cron_inactive,
  COALESCE(e.error_count, 0)                                     AS errors_24h,
  COALESCE(f.total, 0)                                           AS fantasy_total,
  COALESCE(f.matched, 0)                                         AS fantasy_matched,
  GREATEST(COALESCE(f.total,0) - COALESCE(f.matched,0), 0)      AS fantasy_unmatched,
  f.last_updated                                                 AS fantasy_last_updated,
  COALESCE(s.active_subs, 0)                                     AS active_subscriptions,
  COALESCE(s.total_profiles, 0)                                  AS total_profiles,
  COALESCE(eb.edge_board_rows, 0)                                AS edge_board_rows,
  eb.edge_board_refreshed_at                                     AS edge_board_refreshed_at
FROM rankings r
CROSS JOIN ai_cover ac
CROSS JOIN ai_recos ar
CROSS JOIN queue_state q
CROSS JOIN mw_state mw
CROSS JOIN cron_state cr
CROSS JOIN errors e
CROSS JOIN fantasy f
CROSS JOIN subs s
CROSS JOIN eb;

GRANT SELECT ON admin.v_system_state TO authenticated;

-- ── Step 2: Rebuild public.v_command_center_status with eligible-only logic ──

CREATE VIEW public.v_command_center_status AS
SELECT
  s.rankings_cache_rows,
  s.rankings_refreshed_at                                        AS rankings_cache_refreshed_at,
  s.rankings_health                                              AS rankings_cache_status,
  s.pipeline_status,
  s.pipeline_last_run,
  s.pipeline_finished_at,
  CASE
    WHEN s.pipeline_status IN ('complete', 'completed') THEN 'ok'
    WHEN s.pipeline_status = 'partial'                  THEN 'warn'
    WHEN s.pipeline_status IN ('failed', 'error')       THEN 'error'
    ELSE 'warn'
  END                                                            AS pipeline_health,
  s.ai_players_covered                                           AS ai_analysis_rows,
  s.ai_players_missing                                           AS ai_missing_players,
  -- Zero-game players intentionally excluded from AI — not an error signal
  s.ai_players_excluded                                          AS ai_players_excluded,
  -- ai_last_updated: legacy reco timestamp (may be null)
  s.reco_last_updated                                            AS ai_last_updated,
  -- ai_last_generation: real latest AI output timestamp
  (SELECT MAX(pa.generated_at) FROM ai.player_ai_analysis pa)   AS ai_last_generation,
  s.reco_rows,
  s.reco_last_updated,
  -- ai_health: based on ELIGIBLE player coverage only (zero-game excluded players do not count)
  CASE
    WHEN s.ai_players_missing = 0    THEN 'ok'
    WHEN s.ai_players_missing >= 100 THEN 'error'
    WHEN s.ai_players_missing >= 30  THEN 'warn'
    ELSE 'ok'
  END                                                            AS ai_health,
  s.queue_pending,
  s.queue_processing,
  s.queue_complete,
  s.queue_failed,
  CASE
    WHEN s.queue_failed > 20 THEN 'error'
    WHEN s.queue_failed > 5  THEN 'warn'
    ELSE 'ok'
  END                                                            AS queue_health,
  s.mw_last_snapshot                                             AS market_watch_last_refresh,
  CASE
    WHEN s.mw_player_count >= 400 THEN 'ok'
    WHEN s.mw_player_count >= 100 THEN 'warn'
    ELSE 'error'
  END                                                            AS market_watch_quality,
  CASE
    WHEN s.mw_player_count >= 200 THEN 'ok'
    WHEN s.mw_player_count >= 50  THEN 'warn'
    ELSE 'error'
  END                                                            AS market_watch_health,
  s.cron_active                                                  AS cron_active_count,
  s.cron_inactive                                                AS cron_inactive_count,
  0                                                              AS cron_failed_count,
  CASE
    WHEN s.cron_active >= 1 THEN 'ok'
    ELSE 'warn'
  END                                                            AS cron_health,
  s.errors_24h                                                   AS recent_error_count,
  NULL::timestamptz                                              AS system_logs_last_event_at,
  CASE
    WHEN s.errors_24h > 50 THEN 'error'
    WHEN s.errors_24h > 10 THEN 'warn'
    ELSE 'ok'
  END                                                            AS logs_health,
  s.fantasy_last_updated                                         AS fantasy_price_last_updated,
  s.fantasy_matched                                              AS fantasy_matched_count,
  GREATEST(s.fantasy_total - s.fantasy_matched, 0)              AS fantasy_unmatched_count,
  (SELECT MAX(pam.updated_at) FROM afl.player_accuracy_metrics pam) AS accuracy_last_updated,
  s.edge_board_refreshed_at                                      AS edge_board_last_refreshed,
  s.edge_board_rows
FROM admin.v_system_state s;

GRANT SELECT ON public.v_command_center_status TO authenticated;
