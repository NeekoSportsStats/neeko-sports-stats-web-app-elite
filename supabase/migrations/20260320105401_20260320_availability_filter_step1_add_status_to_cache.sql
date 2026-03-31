/*
  # Availability Filter — Step 1: Add status columns to player_rankings_cache

  ## Summary
  Adds `status` and `is_available` columns to `afl.player_rankings_cache`
  so downstream views can filter OUT players without joining back to player_prices.

  ## Changes
  - afl.player_rankings_cache:
    - `status` TEXT (AVAILABLE | OUT | TEST | NULL)
    - `is_available` BOOLEAN GENERATED from status

  NULL status means no price row exists — treated as available (conservative: don't filter unknown players).
  OUT means definitively ruled out — excluded from BUY/captain/breakout outputs.
  TEST means doubtful — remains visible.

  ## Notes
  - Existing rows get is_available = TRUE by default (safe until next cache refresh)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'status'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN status TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'is_available'
  ) THEN
    ALTER TABLE afl.player_rankings_cache
      ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- Back-fill is_available from any existing status data
UPDATE afl.player_rankings_cache
SET is_available = CASE WHEN status = 'OUT' THEN false ELSE true END
WHERE status IS NOT NULL;

-- Create an index for fast filtering
CREATE INDEX IF NOT EXISTS idx_player_rankings_cache_is_available
  ON afl.player_rankings_cache (is_available);
