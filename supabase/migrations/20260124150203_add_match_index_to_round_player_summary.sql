/*
  # Add match_index column for Round 24 double-header support

  1. Schema Changes
    - Add `match_index` column to `afl.round_player_summary` table
    - Default value is 1 for all existing records

  2. Purpose
    - Supports 2025 Round 24 double-header where Essendon and Gold Coast
      each played two matches
    - Allows unique identification of matches using (team, round_number, match_index)
    - match_index = 1 for first game, match_index = 2 for second game in double-header
    - All other rounds have match_index = 1

  3. Notes
    - No data loss - all existing records get match_index = 1
    - Backward compatible - queries without match_index filter will still work
    - Updates UNIQUE constraint to include match_index
*/

-- Add match_index to afl.round_player_summary
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
    AND table_name = 'round_player_summary'
    AND column_name = 'match_index'
  ) THEN
    ALTER TABLE afl.round_player_summary
    ADD COLUMN match_index INTEGER DEFAULT 1 NOT NULL;
  END IF;
END $$;

-- Drop old unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'afl'
    AND table_name = 'round_player_summary'
    AND constraint_name = 'round_player_summary_season_round_number_player_id_key'
  ) THEN
    ALTER TABLE afl.round_player_summary
    DROP CONSTRAINT round_player_summary_season_round_number_player_id_key;
  END IF;
END $$;

-- Add new unique constraint including match_index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'afl'
    AND table_name = 'round_player_summary'
    AND constraint_name = 'round_player_summary_season_round_player_match_key'
  ) THEN
    ALTER TABLE afl.round_player_summary
    ADD CONSTRAINT round_player_summary_season_round_player_match_key
    UNIQUE (season, round_number, player_id, match_index);
  END IF;
END $$;

-- Add index on (season, round_number, match_index) for faster queries
CREATE INDEX IF NOT EXISTS idx_round_player_summary_season_round_match
  ON afl.round_player_summary(season, round_number, match_index);

-- Add comment explaining the column
COMMENT ON COLUMN afl.round_player_summary.match_index IS
  'Match index for double-header rounds. Usually 1, but 2 for second game in Round 24 2025 double-header (Essendon, Gold Coast)';
