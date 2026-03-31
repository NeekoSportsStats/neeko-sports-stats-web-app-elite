/*
  # Phase 6: Add games_played, matchup_multiplier, matchup_label to player_rankings_cache

  ## Summary
  The cache table was missing games_played, matchup_multiplier, and matchup_label columns.
  This caused the frontend to always show NULL for these fields.

  ## New columns
  - games_played: integer — number of AFL games played in 2026 season
  - matchup_multiplier: numeric — raw multiplier (e.g. 1.08)
  - matchup_label: text — human-readable (ELITE/GOOD/NEUTRAL/TOUGH)

  Note: matchup_rating column is renamed to matchup_label for clarity.
  The existing matchup_rating column (text) is kept as matchup_label.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'games_played'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN games_played integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'matchup_multiplier'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN matchup_multiplier numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'matchup_label'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN matchup_label text;
  END IF;
END $$;
