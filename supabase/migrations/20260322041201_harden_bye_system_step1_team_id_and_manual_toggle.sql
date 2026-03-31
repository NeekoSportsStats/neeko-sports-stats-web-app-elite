/*
  # Harden Bye System — Step 1: team_id canonical join + is_bye_active manual toggle

  ## Summary
  Removes fragile team_name join from the bye system and replaces it with team_id.
  Adds is_bye_active manual toggle as the ONLY runtime control for bye state.

  ## Changes

  ### afl.team_byes
  - Add team_id INT (FK → afl.teams.team_id)
  - Add is_bye_active BOOLEAN DEFAULT FALSE (manual override — drives all runtime logic)
  - Populate team_id from existing team_name values
  - Add unique constraint on (team_id, season)
  - Keep team_name for reference only (not used in joins)
  - Drop old (team_name, season) unique constraint — replaced by team_id one

  ### afl.player_rankings_cache
  - Add team_id INT column
  - Populate from afl.teams via team_name match

  ## Security
  - RLS unchanged
*/

-- ── STEP 1: Add team_id to team_byes ──────────────────────────────────────────

ALTER TABLE afl.team_byes
  ADD COLUMN IF NOT EXISTS team_id INT;

-- ── STEP 2: Populate team_id from team_name match ─────────────────────────────

UPDATE afl.team_byes tb
SET team_id = t.team_id
FROM afl.teams t
WHERE tb.team_name = t.team_name
  AND tb.team_id IS NULL;

-- ── STEP 3: Add is_bye_active toggle column ───────────────────────────────────

ALTER TABLE afl.team_byes
  ADD COLUMN IF NOT EXISTS is_bye_active BOOLEAN NOT NULL DEFAULT FALSE;

-- ── STEP 4: Drop old unique constraint, add new team_id+season unique ─────────

DO $$
BEGIN
  -- Drop old team_name+season constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'afl'
      AND table_name = 'team_byes'
      AND constraint_name = 'team_byes_unique_team_season'
  ) THEN
    ALTER TABLE afl.team_byes DROP CONSTRAINT team_byes_unique_team_season;
  END IF;

  -- Add team_id+season unique constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'afl'
      AND table_name = 'team_byes'
      AND constraint_name = 'team_byes_unique_team_id_season'
  ) THEN
    ALTER TABLE afl.team_byes
      ADD CONSTRAINT team_byes_unique_team_id_season UNIQUE (team_id, season);
  END IF;
END $$;

-- ── STEP 5: Add team_id to player_rankings_cache ──────────────────────────────

ALTER TABLE afl.player_rankings_cache
  ADD COLUMN IF NOT EXISTS team_id INT;

-- ── STEP 6: Populate cache team_id from teams table ──────────────────────────

UPDATE afl.player_rankings_cache c
SET team_id = t.team_id
FROM afl.teams t
WHERE c.team_name = t.team_name
  AND c.team_id IS NULL;
