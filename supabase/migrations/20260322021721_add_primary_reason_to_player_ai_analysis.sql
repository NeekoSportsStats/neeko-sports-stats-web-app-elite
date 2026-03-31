/*
  # Add primary_reason column to ai.player_ai_analysis

  ## Summary
  Adds a dedicated `primary_reason` column to store the WHY sentence separately
  from the full 5-sentence breakdown (summary_long). This enables clean display
  mapping: WHY → highlight text, LONG → expanded analysis.

  ## Changes
  - ai.player_ai_analysis: adds `primary_reason text` column (nullable, max 200 chars)
  - No data loss — existing rows retain all existing columns
  - summary_short is retained for backward compat but will now store WHY text
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ai'
      AND table_name = 'player_ai_analysis'
      AND column_name = 'primary_reason'
  ) THEN
    ALTER TABLE ai.player_ai_analysis ADD COLUMN primary_reason text;
  END IF;
END $$;
