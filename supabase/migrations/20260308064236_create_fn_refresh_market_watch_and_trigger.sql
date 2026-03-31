/*
  # Create fn_refresh_market_watch and trigger on afl_player_prices

  ## Summary
  Creates a public refresh function and an automatic trigger so Market Watch
  tables (market.market_watch_snapshots) recalculate when new player prices
  are loaded into afl_player_prices.

  ## Approach
  - Uses the same deferred queue pattern as the Edge Board refresh
  - A trigger on afl_player_prices inserts to market_watch_refresh_queue
  - A pg_cron job every 5 minutes processes pending items by calling
    market.build_market_watch_snapshot()

  ## New Objects
  - public.market_watch_refresh_queue — holds pending refresh requests
  - public.fn_queue_market_watch_refresh() — trigger function
  - public.fn_refresh_market_watch() — callable function (admin / cron)
  - public.fn_process_market_watch_refresh_queue() — queue processor (cron)
  - Cron job: process-market-watch-queue (every 5 min)
  - Cron job: refresh-market-watch-daily (daily 15:10 UTC, after pipeline)
*/

-- ─── 1. Refresh queue table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_watch_refresh_queue (
  id           serial PRIMARY KEY,
  requested_at timestamptz DEFAULT now() NOT NULL,
  reason       text,
  completed_at timestamptz
);

ALTER TABLE public.market_watch_refresh_queue ENABLE ROW LEVEL SECURITY;

-- ─── 2. Public-facing refresh function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_refresh_market_watch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'market'
AS $$
BEGIN
  PERFORM market.build_market_watch_snapshot();
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_refresh_market_watch() TO authenticated;

-- ─── 3. Trigger function: queues refresh when prices arrive ───────────────────

CREATE OR REPLACE FUNCTION public.fn_queue_market_watch_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.market_watch_refresh_queue (reason)
  VALUES ('afl_player_prices updated — season ' || NEW.season::text || ' round ' || NEW.round_number::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_market_watch_refresh ON public.afl_player_prices;

CREATE TRIGGER trg_queue_market_watch_refresh
  AFTER INSERT OR UPDATE ON public.afl_player_prices
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_queue_market_watch_refresh();

-- ─── 4. Queue processor ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_process_market_watch_refresh_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'market'
AS $$
DECLARE
  v_pending integer;
BEGIN
  SELECT COUNT(*) INTO v_pending
  FROM public.market_watch_refresh_queue
  WHERE completed_at IS NULL;

  IF v_pending > 0 THEN
    PERFORM market.build_market_watch_snapshot();

    UPDATE public.market_watch_refresh_queue
    SET completed_at = now()
    WHERE completed_at IS NULL;
  END IF;
END;
$$;

-- ─── 5. Cron jobs ─────────────────────────────────────────────────────────────

SELECT cron.unschedule('process-market-watch-queue')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-market-watch-queue');

SELECT cron.schedule(
  'process-market-watch-queue',
  '*/5 * * * *',
  $$ SELECT public.fn_process_market_watch_refresh_queue(); $$
);

SELECT cron.unschedule('refresh-market-watch-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-market-watch-daily');

SELECT cron.schedule(
  'refresh-market-watch-daily',
  '10 15 * * *',
  $$ SELECT public.fn_refresh_market_watch(); $$
);
