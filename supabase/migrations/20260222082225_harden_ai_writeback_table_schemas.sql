/*
  # Harden AI writeback table schemas

  ## Changes

  ### afl.ai_team_summaries
  - Add round_number column (integer, nullable initially)
  - Add round_number to the primary key: (team, season, round_number)
  - Drop old PK on (team) only
  - Drop old unique constraint on (team, season) — superseded by new PK
  - Rename column `summary` → alias kept, add `ai_summary` alias column not needed
    (keep existing `summary` column as-is, functions will write to it)

  ### afl.ai_match_predictions
  - Add updated_at column for skip-freshness logic
  - The existing UNIQUE on match_id is sufficient for upsert conflict target

  ### afl.ai_player_summaries
  - PK (player, season, round_number) already correct — no change needed

  ## Notes
  - All changes are additive/safe — no data is dropped
  - round_number set nullable to avoid breaking existing rows during migration
*/

-- ── ai_team_summaries ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name   = 'ai_team_summaries'
      AND column_name  = 'round_number'
  ) THEN
    ALTER TABLE afl.ai_team_summaries ADD COLUMN round_number integer;
  END IF;
END $$;

-- Drop old primary key (team only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema   = 'afl'
      AND table_name     = 'ai_team_summaries'
      AND constraint_name = 'ai_team_summaries_pkey'
  ) THEN
    ALTER TABLE afl.ai_team_summaries DROP CONSTRAINT ai_team_summaries_pkey;
  END IF;
END $$;

-- Drop old unique (team, season) if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema   = 'afl'
      AND table_name     = 'ai_team_summaries'
      AND constraint_name = 'ai_team_summaries_unique'
  ) THEN
    ALTER TABLE afl.ai_team_summaries DROP CONSTRAINT ai_team_summaries_unique;
  END IF;
END $$;

-- Add new composite primary key (team, season, round_number)
-- Existing rows with null round_number need a placeholder first
UPDATE afl.ai_team_summaries SET round_number = 0 WHERE round_number IS NULL;

ALTER TABLE afl.ai_team_summaries ALTER COLUMN round_number SET NOT NULL;
ALTER TABLE afl.ai_team_summaries ALTER COLUMN season SET NOT NULL;

ALTER TABLE afl.ai_team_summaries
  ADD CONSTRAINT ai_team_summaries_pkey PRIMARY KEY (team, season, round_number);

-- ── ai_match_predictions ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name   = 'ai_match_predictions'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE afl.ai_match_predictions
      ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Backfill updated_at from created_at for existing rows
UPDATE afl.ai_match_predictions
SET updated_at = created_at
WHERE updated_at IS NULL AND created_at IS NOT NULL;
