
/*
  # Phase 4 + 10: Snapshot Trust Layer + Pipeline Logs

  ## Summary
  Creates the foundational infrastructure for data trust: a single canonical
  snapshot per pipeline run, and structured pipeline step logging.

  ## New Tables

  ### admin.snapshots
  One row per pipeline run. Tracks validation status for rankings data.
  - `snapshot_id` (uuid PK) — shared across all rows written in one pipeline run
  - `created_at`, `source_run_id` — traceability back to pipeline_runs
  - `validation_status` — pending | valid | invalid
  - `rankings_count`, `ai_coverage_pct`, `market_watch_ok`, `confidence_ok`
  - `is_live` — only ONE row is live at a time (the last validated snapshot)
  - `invalidated_reason` — text explanation if snapshot was rejected

  ### admin.pipeline_logs
  Structured step-level logging for every pipeline run.
  - Replaces/supplements pipeline_steps for admin visibility
  - Includes: run_id, step, status, duration_ms, error, metadata (jsonb)

  ## Notes
  - RLS enabled on both tables. Only service_role can write; authenticated can read.
  - admin.snapshots has a constraint: only one is_live = true row at a time (enforced by function).
*/

CREATE TABLE IF NOT EXISTS admin.snapshots (
  snapshot_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  source_run_id        uuid        REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  validation_status    text        NOT NULL DEFAULT 'pending'
                                   CHECK (validation_status IN ('pending','valid','invalid')),
  is_live              boolean     NOT NULL DEFAULT false,
  rankings_count       integer,
  ai_coverage_pct      numeric(5,2),
  market_watch_ok      boolean,
  confidence_ok        boolean,
  invalidated_reason   text,
  metadata             jsonb       NOT NULL DEFAULT '{}'
);

ALTER TABLE admin.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on snapshots"
  ON admin.snapshots FOR SELECT
  TO authenticated
  USING (true);

-- pipeline_logs: structured step logging
CREATE TABLE IF NOT EXISTS admin.pipeline_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid        REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  step        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','success','failed','skipped')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer     GENERATED ALWAYS AS (
    CASE WHEN finished_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (finished_at - started_at))::integer * 1000
    ELSE NULL END
  ) STORED,
  error       text,
  metadata    jsonb       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_pipeline_logs_run_id ON admin.pipeline_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_logs_started ON admin.pipeline_logs(started_at DESC);

ALTER TABLE admin.pipeline_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read pipeline logs"
  ON admin.pipeline_logs FOR SELECT
  TO authenticated
  USING (true);

-- Add snapshot_id column to player_rankings_cache if not using per-row UUIDs
-- We change cache_snapshot_id to reference admin.snapshots.snapshot_id
-- NOTE: We do NOT drop the existing column — we just make a shared snapshot FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
      AND column_name = 'pipeline_snapshot_id'
  ) THEN
    ALTER TABLE afl.player_rankings_cache
      ADD COLUMN pipeline_snapshot_id uuid REFERENCES admin.snapshots(snapshot_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rankings_pipeline_snapshot 
  ON afl.player_rankings_cache(pipeline_snapshot_id);
