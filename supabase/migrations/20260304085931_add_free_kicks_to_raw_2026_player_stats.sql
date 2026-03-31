/*
  # Add Free Kick Columns to raw_2026_player_stats

  ## Summary
  Adds free_kicks_for and free_kicks_against columns to the raw 2026 player stats
  ingest table so the API pipeline can populate them during ingestion.

  ## Changes
  - `afl.raw_2026_player_stats`: adds `free_kicks_for` (integer, default 0)
  - `afl.raw_2026_player_stats`: adds `free_kicks_against` (integer, default 0)

  ## Notes
  - Safe additive migration — no existing data is modified
  - Both columns default to 0 so existing rows and partial API payloads remain valid
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name = 'raw_2026_player_stats'
      AND column_name = 'free_kicks_for'
  ) THEN
    ALTER TABLE afl.raw_2026_player_stats
      ADD COLUMN free_kicks_for integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name = 'raw_2026_player_stats'
      AND column_name = 'free_kicks_against'
  ) THEN
    ALTER TABLE afl.raw_2026_player_stats
      ADD COLUMN free_kicks_against integer NOT NULL DEFAULT 0;
  END IF;
END $$;
