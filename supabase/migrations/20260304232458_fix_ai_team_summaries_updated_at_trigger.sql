/*
  # Fix ai_team_summaries updated_at Auto-Population

  ## Problem
  afl.ai_team_summaries has an updated_at column but it is NULL on all 18 rows.
  The column was not being auto-populated on INSERT or UPDATE, making it impossible
  to detect when team AI summaries were last regenerated.

  ## Changes
  1. Create (or replace) a generic set_updated_at() trigger function in the afl schema
  2. Attach a BEFORE INSERT OR UPDATE trigger to afl.ai_team_summaries
  3. Backfill all existing rows where updated_at IS NULL with current timestamp

  ## Security
  - Trigger function uses SECURITY INVOKER (default) — no elevated privileges
  - No RLS changes

  ## Notes
  - CREATE OR REPLACE is safe to re-run
  - Trigger will fire on every INSERT and UPDATE going forward
  - Backfill sets existing NULLs to now() to establish a baseline timestamp
*/

CREATE OR REPLACE FUNCTION afl.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_team_summaries_updated ON afl.ai_team_summaries;

CREATE TRIGGER trg_ai_team_summaries_updated
  BEFORE INSERT OR UPDATE ON afl.ai_team_summaries
  FOR EACH ROW
  EXECUTE FUNCTION afl.set_updated_at();

UPDATE afl.ai_team_summaries
SET updated_at = now()
WHERE updated_at IS NULL;
