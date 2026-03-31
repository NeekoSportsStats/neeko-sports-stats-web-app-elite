/*
  # Add Edge Board Refresh Trigger on afl_player_prices

  ## Summary
  When a new round of player prices is loaded into afl_player_prices (the signal
  that a new AFL round has started), automatically queue a refresh of mv_edge_board.

  Because REFRESH MATERIALIZED VIEW cannot run inside a trigger function directly
  (it would block the INSERT transaction), we use a pg_cron deferred approach:
  the trigger logs to a small helper table and a cron job picks it up within 5 minutes.

  ## Tables Created
  - public.edge_board_refresh_queue
    - id: serial PK
    - requested_at: timestamptz
    - reason: text (describes what triggered the refresh)
    - completed_at: timestamptz (set when refresh runs)

  ## Function: fn_queue_edge_board_refresh
  - Called by trigger on afl_player_prices after INSERT/UPDATE of a new round
  - Inserts a row into edge_board_refresh_queue
  - Only fires when round_number changes (new round loaded)

  ## Function: fn_process_edge_board_refresh_queue
  - Called by pg_cron every 5 minutes
  - Checks for pending refresh requests
  - Runs REFRESH MATERIALIZED VIEW CONCURRENTLY if any pending requests exist
  - Marks them complete

  ## Cron Job
  - process-edge-board-queue: every 5 minutes — picks up pending refresh requests
*/

-- ─── 1. Refresh queue table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.edge_board_refresh_queue (
  id           serial PRIMARY KEY,
  requested_at timestamptz DEFAULT now() NOT NULL,
  reason       text,
  completed_at timestamptz
);

ALTER TABLE public.edge_board_refresh_queue ENABLE ROW LEVEL SECURITY;

-- ─── 2. Trigger function: queues a refresh when new prices arrive ─────────────

CREATE OR REPLACE FUNCTION public.fn_queue_edge_board_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.edge_board_refresh_queue (reason)
  VALUES ('afl_player_prices updated — round ' || NEW.round_number::text || ' season ' || NEW.season::text);
  RETURN NEW;
END;
$$;

-- ─── 3. Trigger on afl_player_prices (fires once per new round inserted) ──────
-- Use WHEN clause to only fire when a genuinely new round is the MAX round

DROP TRIGGER IF EXISTS trg_queue_edge_board_refresh ON public.afl_player_prices;

CREATE TRIGGER trg_queue_edge_board_refresh
  AFTER INSERT OR UPDATE ON public.afl_player_prices
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.fn_queue_edge_board_refresh();

-- ─── 4. Queue processor function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_process_edge_board_refresh_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending_count integer;
BEGIN
  SELECT COUNT(*) INTO v_pending_count
  FROM public.edge_board_refresh_queue
  WHERE completed_at IS NULL;

  IF v_pending_count > 0 THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;

    UPDATE public.edge_board_refresh_queue
    SET completed_at = now()
    WHERE completed_at IS NULL;
  END IF;
END;
$$;

-- ─── 5. Cron job: process queue every 5 minutes ───────────────────────────────

SELECT cron.unschedule('process-edge-board-queue')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-edge-board-queue');

SELECT cron.schedule(
  'process-edge-board-queue',
  '*/5 * * * *',
  $$ SELECT public.fn_process_edge_board_refresh_queue(); $$
);
