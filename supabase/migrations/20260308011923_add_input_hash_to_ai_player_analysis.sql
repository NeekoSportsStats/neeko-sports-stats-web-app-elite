/*
  # Add input_hash to ai_player_analysis

  ## Summary
  Adds an `input_hash` column to the `ai_player_analysis` table to enable
  change detection in the generate-ranking-ai edge function. This allows
  the function to skip regeneration when player data has not changed since
  the last AI run, preventing unnecessary OpenAI API calls.

  ## Changes
  - `ai_player_analysis`: adds `input_hash text` column (nullable)

  ## Notes
  - Existing rows will have NULL input_hash, meaning they will be regenerated
    once on the next pipeline run, after which hashes will be stored and
    future runs will only regenerate players with changed data.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_player_analysis' AND column_name = 'input_hash'
  ) THEN
    ALTER TABLE ai_player_analysis ADD COLUMN input_hash text;
  END IF;
END $$;
