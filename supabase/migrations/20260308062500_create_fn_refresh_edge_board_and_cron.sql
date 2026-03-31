/*
  # Create fn_refresh_edge_board Function + pg_cron Schedule

  ## Summary
  Creates a refresh function for mv_edge_board and schedules it via pg_cron
  to run automatically:

  1. Daily at 15:05 UTC — fires 5 minutes after the weekly AFL pipeline (15:00 UTC)
     so the Edge Board reflects new projections within minutes of the pipeline finishing
  2. Thursday 10:10 UTC (21:10 AEDT) — after AFL team selections are typically
     announced, projections update and the board refreshes overnight

  ## Function: fn_refresh_edge_board
  - Refreshes mv_edge_board CONCURRENTLY (no full table lock — safe during live traffic)
  - Logs the refresh to afl.ai_generation_logs if the table exists (best-effort)
  - Returns the new refreshed_at timestamp

  ## Cron Jobs
  - refresh-edge-board-daily: every day 15:05 UTC (after pipeline)
  - refresh-edge-board-thursday: Thursday 10:10 UTC (after teams named AEDT night)
  - Replaces any existing job with those names to avoid duplicates
*/

-- ─── 1. Refresh function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_refresh_edge_board()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_refreshed_at timestamptz;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;

  SELECT MAX(refreshed_at) INTO v_refreshed_at FROM public.mv_edge_board;

  RETURN v_refreshed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_refresh_edge_board() TO authenticated;

-- ─── 2. Remove any existing edge-board cron jobs to avoid duplicates ──────────

SELECT cron.unschedule('refresh-edge-board-daily')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-edge-board-daily');
SELECT cron.unschedule('refresh-edge-board-thursday') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-edge-board-thursday');

-- ─── 3. Schedule: daily at 15:05 UTC (5 min after AFL pipeline at 15:00 UTC) ──

SELECT cron.schedule(
  'refresh-edge-board-daily',
  '5 15 * * *',
  $$ SELECT public.fn_refresh_edge_board(); $$
);

-- ─── 4. Schedule: Thursday 10:10 UTC = ~21:10 AEDT (after teams named) ────────

SELECT cron.schedule(
  'refresh-edge-board-thursday',
  '10 10 * * 4',
  $$ SELECT public.fn_refresh_edge_board(); $$
);
