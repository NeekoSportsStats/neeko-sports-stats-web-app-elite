/*
  # Fix Stuck AI Generation Queue + Add Watchdog

  ## Summary
  The AI generation worker crashed mid-run, leaving rows stuck in "processing"
  with processed_at = NULL and created_at hours ago. Because no "pending" rows
  exist the pipeline cannot resume.

  ## Changes

  1. **Add updated_at to ai_generation_queue**
     The table currently has no updated_at column, making it impossible to detect
     staleness by row age. This adds the column with a trigger to auto-update it.

  2. **Reset all stuck jobs**
     Any row with status = 'processing' and processed_at IS NULL is definitively
     stuck (worker never acknowledged it). Reset them to 'pending' so the worker
     can pick them up again.

  3. **Create watchdog function + cron**
     A pg_cron job runs every 5 minutes. Any row marked 'processing' for more than
     5 minutes without an updated_at change is reset to 'pending' with attempts
     incremented (so runaway jobs don't loop forever — capped at 5 attempts).

  ## Security
  No RLS changes — existing policies preserved.
*/

-- ─── 1. Add updated_at column ─────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ai_generation_queue'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE public.ai_generation_queue
      ADD COLUMN updated_at timestamptz DEFAULT now();

    UPDATE public.ai_generation_queue
      SET updated_at = COALESCE(processed_at, created_at);
  END IF;
END $$;

-- Trigger to keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION public.fn_ai_queue_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_queue_updated_at ON public.ai_generation_queue;
CREATE TRIGGER trg_ai_queue_updated_at
  BEFORE UPDATE ON public.ai_generation_queue
  FOR EACH ROW EXECUTE FUNCTION public.fn_ai_queue_set_updated_at();

-- ─── 2. Reset ALL stuck processing jobs right now ─────────────────────────────
-- Any row with status='processing' and processed_at IS NULL was never picked up
-- properly. Reset them unconditionally.

UPDATE public.ai_generation_queue
SET
  status     = 'pending',
  updated_at = now()
WHERE status = 'processing'
  AND processed_at IS NULL;

-- Also reset any "processing" rows where updated_at is older than 5 minutes
-- (catches rows that may have been partially updated but still hung)

UPDATE public.ai_generation_queue
SET
  status     = 'pending',
  attempts   = COALESCE(attempts, 0) + 1,
  updated_at = now()
WHERE status     = 'processing'
  AND updated_at < now() - interval '5 minutes'
  AND COALESCE(attempts, 0) < 5;

-- ─── 3. Watchdog function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ai_queue_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_generation_queue
  SET
    status     = 'pending',
    attempts   = COALESCE(attempts, 0) + 1,
    updated_at = now()
  WHERE status     = 'processing'
    AND updated_at < now() - interval '5 minutes'
    AND COALESCE(attempts, 0) < 5;
END;
$$;

-- ─── 4. Schedule watchdog every 5 minutes ────────────────────────────────────

SELECT cron.unschedule('ai-queue-watchdog') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ai-queue-watchdog'
);

SELECT cron.schedule(
  'ai-queue-watchdog',
  '*/5 * * * *',
  $$ SELECT public.fn_ai_queue_watchdog(); $$
);
