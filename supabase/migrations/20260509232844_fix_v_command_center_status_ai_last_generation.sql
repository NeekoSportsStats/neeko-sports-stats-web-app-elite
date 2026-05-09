/*
  # Fix v_command_center_status — add ai_last_generation and fix ai_health threshold

  ## Summary

  Two fixes to the public v_command_center_status view:

  1. **ai_last_generation column** — adds the real latest AI generation timestamp
     sourced from `ai.player_ai_analysis.generated_at` (the actual AI output table).
     Previously `ai_last_updated` was aliased from `reco_last_updated` which is null
     because the legacy `ai_rankings_player_recos` table is empty. The Dashboard
     reads `status.ai_last_generation` — this was always showing "—".

  2. **ai_health threshold fix** — the view drove `ai_health = error` when
     `ai_players_missing >= 50`. With 80 missing players (stale/regen queue),
     this was permanently red. Aligned to the canonical thresholds from
     `get_operator_console_state()`: error >= 100 missing, warn >= 30 missing.
     This matches the AI status banner logic already in the Command Center.

  ## Changes

  - Drops and recreates `public.v_command_center_status`
  - Sources `ai_last_generation` from `MAX(ai.player_ai_analysis.generated_at)`
  - Changes `ai_health` thresholds: error >= 100, warn >= 30 (was error >= 50)
  - All other columns unchanged

  ## No data mutations — view-only change
*/

DROP VIEW IF EXISTS public.v_command_center_status;

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
  -- ai_last_updated: legacy reco timestamp (may be null)
  s.reco_last_updated                                            AS ai_last_updated,
  -- ai_last_generation: real latest AI output from player_ai_analysis
  (SELECT MAX(pa.generated_at) FROM ai.player_ai_analysis pa)   AS ai_last_generation,
  s.reco_rows,
  s.reco_last_updated,
  -- ai_health aligned with get_operator_console_state thresholds (error>=100, warn>=30)
  CASE
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

-- Grant read access to authenticated users (admin guard is enforced at the API layer)
GRANT SELECT ON public.v_command_center_status TO authenticated;
