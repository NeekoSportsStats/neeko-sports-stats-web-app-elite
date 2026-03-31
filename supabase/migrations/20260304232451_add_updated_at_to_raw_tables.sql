/*
  # Add updated_at Timestamps to Raw AFL Tables

  ## Problem
  The following tables had no timestamp columns, making it impossible to
  audit when data was last written or detect stale ingest:
  - afl.player_roster_2026_raw
  - afl.player_round_stats_2025

  ## Changes
  1. afl.player_roster_2026_raw
     - ADD COLUMN updated_at timestamptz DEFAULT now()
     - Backfill all existing rows with current timestamp

  2. afl.player_round_stats_2025
     - ADD COLUMN updated_at timestamptz DEFAULT now()
     - Backfill all existing rows with current timestamp

  ## Notes
  - Uses IF NOT EXISTS to be idempotent
  - Does not modify any existing columns or rows (data safe)
  - Enables staleness detection in pipeline health checks
*/

ALTER TABLE afl.player_roster_2026_raw
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE afl.player_round_stats_2025
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE afl.player_roster_2026_raw
SET updated_at = now()
WHERE updated_at IS NULL;

UPDATE afl.player_round_stats_2025
SET updated_at = now()
WHERE updated_at IS NULL;
