/*
  # Fix v_command_center_status — accuracy_last_updated

  ## Summary
  Replace the hardcoded `NULL::timestamp` for `accuracy_last_updated` in
  `public.v_command_center_status` with a real subquery that reads the latest
  `updated_at` from `afl.player_accuracy_metrics`.

  ## Changes
  - `accuracy_last_updated`: was `NULL::timestamp` → now reads
    `(SELECT MAX(updated_at) FROM afl.player_accuracy_metrics)`

  No structural changes to any other column. All existing dependents (none found)
  are unaffected.
*/

CREATE OR REPLACE VIEW public.v_command_center_status AS
SELECT
    rankings_cache_rows,
    rankings_refreshed_at                                             AS rankings_cache_refreshed_at,
    rankings_health                                                   AS rankings_cache_status,
    pipeline_status,
    pipeline_last_run,
    pipeline_finished_at,
    CASE
        WHEN pipeline_status = ANY (ARRAY['complete'::text, 'completed'::text]) THEN 'ok'::text
        WHEN pipeline_status = 'partial'::text                                  THEN 'warn'::text
        WHEN pipeline_status = ANY (ARRAY['failed'::text, 'error'::text])       THEN 'error'::text
        ELSE 'warn'::text
    END                                                               AS pipeline_health,
    ai_players_covered                                                AS ai_analysis_rows,
    ai_players_missing                                                AS ai_missing_players,
    reco_last_updated                                                 AS ai_last_updated,
    reco_rows,
    reco_last_updated,
    CASE
        WHEN ai_players_missing = 0     THEN 'ok'::text
        WHEN ai_players_missing < 50    THEN 'warn'::text
        ELSE                                 'error'::text
    END                                                               AS ai_health,
    queue_pending,
    queue_processing,
    queue_complete,
    queue_failed,
    CASE
        WHEN queue_failed > 20  THEN 'error'::text
        WHEN queue_failed > 5   THEN 'warn'::text
        ELSE                         'ok'::text
    END                                                               AS queue_health,
    mw_last_snapshot                                                  AS market_watch_last_refresh,
    CASE
        WHEN mw_player_count >= 400 THEN 'ok'::text
        WHEN mw_player_count >= 100 THEN 'warn'::text
        ELSE                             'error'::text
    END                                                               AS market_watch_quality,
    CASE
        WHEN mw_player_count >= 200 THEN 'ok'::text
        WHEN mw_player_count >= 50  THEN 'warn'::text
        ELSE                             'error'::text
    END                                                               AS market_watch_health,
    cron_active                                                       AS cron_active_count,
    cron_inactive                                                     AS cron_inactive_count,
    0                                                                 AS cron_failed_count,
    CASE
        WHEN cron_active >= 1 THEN 'ok'::text
        ELSE                       'warn'::text
    END                                                               AS cron_health,
    errors_24h                                                        AS recent_error_count,
    NULL::timestamp with time zone                                    AS system_logs_last_event_at,
    CASE
        WHEN errors_24h > 50 THEN 'error'::text
        WHEN errors_24h > 10 THEN 'warn'::text
        ELSE                      'ok'::text
    END                                                               AS logs_health,
    fantasy_last_updated                                              AS fantasy_price_last_updated,
    fantasy_matched                                                   AS fantasy_matched_count,
    fantasy_unmatched                                                 AS fantasy_unmatched_count,
    (SELECT MAX(updated_at) FROM afl.player_accuracy_metrics)        AS accuracy_last_updated,
    NULL::timestamp with time zone                                    AS edge_board_last_refreshed,
    edge_board_rows
FROM admin.v_system_state;
