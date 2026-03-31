/*
  # Fix Pipeline Column Mismatches

  ## Summary
  Two pipeline refresh functions reference wrong column names causing errors
  on every pipeline run.

  ### Fix 1: afl.player_variation
  - Table has `generated_at` but refresh_player_variation() writes `updated_at`
  - Add `updated_at` as an alias column so both names work

  ### Fix 2: afl.player_opponent_concession
  - Table has `season_games_sampled` but refresh_player_opponent_concession() writes `games_sample`
  - Add `games_sample` as an alias column so both names work

  Using ADD COLUMN with defaults rather than renaming to avoid breaking any
  existing queries that reference the original column names.
*/

-- Fix 1: player_variation — add updated_at column (function writes this, table has generated_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_variation' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE afl.player_variation ADD COLUMN updated_at timestamptz DEFAULT now();
    -- Backfill from generated_at
    UPDATE afl.player_variation SET updated_at = generated_at WHERE updated_at IS NULL;
  END IF;
END $$;

-- Fix 2: player_opponent_concession — add games_sample column (function writes this, table has season_games_sampled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_opponent_concession' AND column_name = 'games_sample'
  ) THEN
    ALTER TABLE afl.player_opponent_concession ADD COLUMN games_sample integer;
    -- Backfill from season_games_sampled
    UPDATE afl.player_opponent_concession SET games_sample = season_games_sampled WHERE games_sample IS NULL;
  END IF;
END $$;
