/*
  # Add get_fantasy_price_stats function + extend v_command_center_status

  ## Summary
  Two additions to support the "Refresh Fantasy Prices" Command Center button and
  give the status dashboard full visibility into all pipeline stages.

  ## 1. New function: get_fantasy_price_stats()
  Returns a summary of the fantasy price matching state from afl.fantasy_player_market.
  Used by the admin-command edge function's refresh_fantasy_prices handler to return
  a human-readable result summary (total players, matched, unmatched, last_updated).

  ## 2. Replaced view: v_command_center_status
  Extends the existing view with four new columns:
  - fantasy_price_last_updated   — MAX(updated_at) from afl.player_prices
  - fantasy_matched_count        — count of matched rows in afl.fantasy_player_market
  - fantasy_unmatched_count      — count of unmatched rows
  - accuracy_last_updated        — MAX(created_at) from public.projection_accuracy
  - edge_board_last_refreshed    — MAX(refreshed_at) from public.mv_edge_board
  - edge_board_rows              — row count of mv_edge_board

  ## Security
  - Function is SECURITY DEFINER so admin edge function can call it without schema search issues.
  - View reads from existing tables — no new RLS changes needed.
*/

-- ============================================================
-- 1. get_fantasy_price_stats()
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_fantasy_price_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_total     integer := 0;
  v_matched   integer := 0;
  v_unmatched integer := 0;
  v_last_updated timestamptz;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(player_id)::integer,
    (COUNT(*) - COUNT(player_id))::integer,
    MAX(updated_at)
  INTO v_total, v_matched, v_unmatched, v_last_updated
  FROM afl.fantasy_player_market;

  -- If fantasy_player_market is empty, fall back to player_prices
  IF v_total = 0 THEN
    SELECT
      COUNT(*)::integer,
      COUNT(*)::integer,
      0,
      MAX(updated_at)
    INTO v_total, v_matched, v_unmatched, v_last_updated
    FROM afl.player_prices;
  END IF;

  RETURN jsonb_build_object(
    'total_players',  v_total,
    'matched',        v_matched,
    'unmatched',      v_unmatched,
    'last_updated',   v_last_updated
  );
END;
$$;

-- ============================================================
-- 2. Replace v_command_center_status with extended version
-- ============================================================
CREATE OR REPLACE VIEW public.v_command_center_status AS
WITH cache_stats AS (
  SELECT
    COUNT(*)::integer        AS rows,
    MAX(cached_at)           AS refreshed_at
  FROM afl.player_rankings_cache
),
pipeline_latest AS (
  SELECT status, started_at, finished_at
  FROM public.pipeline_runs
  ORDER BY started_at DESC
  LIMIT 1
),
ai_stats AS (
  SELECT
    COUNT(*)::integer                                         AS total_rows,
    COUNT(*) FILTER (WHERE summary_long IS NULL)::integer     AS missing_rows,
    MAX(generated_at)                                         AS last_updated
  FROM ai.player_ai_analysis
),
reco_stats AS (
  SELECT
    COUNT(*)::integer     AS reco_rows,
    MAX(generated_at)     AS reco_last_updated
  FROM ai_rankings_player_recos
),
cron_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE active = true)::integer   AS active_count,
    COUNT(*) FILTER (WHERE active = false)::integer  AS inactive_count,
    0                                                AS failed_count
  FROM cron.job
),
log_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE log_level = 'error' AND created_at >= now() - interval '24 hours')::integer AS recent_error_count,
    MAX(created_at) AS last_event_at
  FROM public.system_logs
),
market_stats AS (
  SELECT
    s.updated_at          AS last_refresh,
    COUNT(sp.player_id)::integer AS player_count
  FROM market.market_watch_snapshot s
  LEFT JOIN market.market_watch_snapshot_players sp ON sp.snapshot_id = s.snapshot_id
  WHERE s.is_active = true
  GROUP BY s.snapshot_id, s.updated_at
  ORDER BY s.updated_at DESC
  LIMIT 1
),
fantasy_stats AS (
  SELECT
    MAX(updated_at)                          AS price_last_updated,
    COUNT(player_id)::integer                AS matched_count,
    (COUNT(*) - COUNT(player_id))::integer   AS unmatched_count
  FROM afl.fantasy_player_market
),
price_stats AS (
  SELECT MAX(updated_at) AS prices_last_updated
  FROM afl.player_prices
),
accuracy_stats AS (
  SELECT MAX(created_at) AS last_updated
  FROM public.projection_accuracy
),
edge_stats AS (
  SELECT
    COUNT(*)::integer  AS row_count,
    MAX(refreshed_at)  AS last_refreshed
  FROM public.mv_edge_board
)
SELECT
  -- Rankings cache
  c.rows                  AS rankings_cache_rows,
  c.refreshed_at          AS rankings_cache_refreshed_at,
  CASE
    WHEN c.rows >= 600 AND c.refreshed_at >= now() - interval '26 hours' THEN 'ok'
    WHEN c.rows >= 400 THEN 'warn'
    ELSE 'error'
  END                     AS rankings_cache_status,
  -- Pipeline
  COALESCE(p.status, 'never_run') AS pipeline_status,
  p.started_at            AS pipeline_last_run,
  p.finished_at           AS pipeline_finished_at,
  CASE
    WHEN p.status = 'complete' THEN 'ok'
    WHEN p.status = 'running'  THEN 'warn'
    WHEN p.status IS NULL      THEN 'warn'
    ELSE 'error'
  END                     AS pipeline_health,
  -- AI
  a.total_rows            AS ai_analysis_rows,
  a.missing_rows          AS ai_missing_players,
  a.last_updated          AS ai_last_updated,
  r.reco_rows,
  r.reco_last_updated,
  CASE
    WHEN a.missing_rows = 0 AND a.last_updated >= now() - interval '48 hours' THEN 'ok'
    WHEN a.missing_rows < 50 THEN 'warn'
    ELSE 'error'
  END                     AS ai_health,
  a.missing_rows          AS queue_pending,
  0                       AS queue_processing,
  (a.total_rows - a.missing_rows) AS queue_complete,
  0                       AS queue_failed,
  CASE
    WHEN a.missing_rows = 0    THEN 'ok'
    WHEN a.missing_rows < 100  THEN 'warn'
    ELSE 'error'
  END                     AS queue_health,
  -- Market watch
  m.last_refresh          AS market_watch_last_refresh,
  CASE
    WHEN m.player_count >= 400 THEN 'good'
    WHEN m.player_count >= 200 THEN 'partial'
    WHEN m.player_count > 0    THEN 'low'
    ELSE 'empty'
  END                     AS market_watch_quality,
  CASE
    WHEN m.last_refresh IS NULL                              THEN 'error'
    WHEN m.last_refresh >= now() - interval '26 hours'      THEN 'ok'
    ELSE 'warn'
  END                     AS market_watch_health,
  -- Cron
  cr.active_count         AS cron_active_count,
  cr.inactive_count       AS cron_inactive_count,
  cr.failed_count         AS cron_failed_count,
  CASE
    WHEN cr.active_count >= 6 THEN 'ok'
    WHEN cr.active_count >= 3 THEN 'warn'
    ELSE 'error'
  END                     AS cron_health,
  -- Logs
  l.recent_error_count,
  l.last_event_at         AS system_logs_last_event_at,
  CASE
    WHEN l.recent_error_count = 0   THEN 'ok'
    WHEN l.recent_error_count < 10  THEN 'warn'
    ELSE 'error'
  END                     AS logs_health,
  -- Fantasy prices (NEW)
  COALESCE(f.price_last_updated, ps.prices_last_updated) AS fantasy_price_last_updated,
  COALESCE(f.matched_count, 0)   AS fantasy_matched_count,
  COALESCE(f.unmatched_count, 0) AS fantasy_unmatched_count,
  -- Accuracy (NEW)
  ac.last_updated         AS accuracy_last_updated,
  -- Edge board (NEW)
  COALESCE(e.last_refreshed, NULL) AS edge_board_last_refreshed,
  COALESCE(e.row_count, 0)         AS edge_board_rows
FROM cache_stats c
CROSS JOIN ai_stats a
CROSS JOIN reco_stats r
CROSS JOIN cron_stats cr
CROSS JOIN log_stats l
LEFT JOIN pipeline_latest p ON true
LEFT JOIN market_stats m ON true
LEFT JOIN fantasy_stats f ON true
LEFT JOIN price_stats ps ON true
LEFT JOIN accuracy_stats ac ON true
LEFT JOIN edge_stats e ON true;
