/*
  # Auto-refresh Market Watch when player stats are ingested

  ## Problem
  Market Watch currently only refreshes when afl_player_prices changes.
  During early rounds (1-3) official fantasy prices don't change between rounds,
  but player form data (raw_2026_player_stats) updates after every match.
  This causes Market Watch signals to go stale even when the pipeline has run.

  ## Solution
  Add a trigger on afl.raw_2026_player_stats that queues a Market Watch refresh
  whenever player stats are inserted or updated. This mirrors the existing trigger
  on afl_player_prices and ensures Market Watch stays current after every pipeline run.

  ## Changes
  1. Create trigger function `afl.fn_queue_market_watch_refresh_on_stats()`
     - Queues a Market Watch refresh row into public.market_watch_refresh_queue
     - Only fires when fantasy_points is being set (not placeholder rows)
     - Uses a 5-minute dedup window to avoid flood-queueing during bulk ingests
  2. Attach trigger to afl.raw_2026_player_stats (AFTER INSERT OR UPDATE)

  ## Notes
  - The existing cron job `process-market-watch-queue` runs every 5 minutes
    and will pick up the queued refresh automatically
  - No changes to projection formulas or schema
*/

CREATE OR REPLACE FUNCTION afl.fn_queue_market_watch_refresh_on_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NEW.fantasy_points IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.market_watch_refresh_queue
    WHERE completed_at IS NULL
    AND requested_at > NOW() - INTERVAL '5 minutes'
  ) THEN
    INSERT INTO public.market_watch_refresh_queue (reason)
    VALUES ('player_stats_ingested');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_market_watch_refresh_on_stats ON afl.raw_2026_player_stats;

CREATE TRIGGER trg_queue_market_watch_refresh_on_stats
AFTER INSERT OR UPDATE ON afl.raw_2026_player_stats
FOR EACH ROW
EXECUTE FUNCTION afl.fn_queue_market_watch_refresh_on_stats();
