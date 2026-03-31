/*
  # Add structured_output column to start_sit_cache

  ## Changes
  - Adds `structured_output` (text, nullable) column to `start_sit_cache` table
  - Stores JSON-encoded structured AI output (short_summary, long_summary, start_conditions, sit_conditions, play_style, decision_context)
  - Safe migration using IF NOT EXISTS pattern
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sit_cache' AND column_name = 'structured_output'
  ) THEN
    ALTER TABLE start_sit_cache ADD COLUMN structured_output text;
  END IF;
END $$;
