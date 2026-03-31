/*
  # Add recommendation_color to ai_rankings_player_recos

  ## Summary
  Adds a `recommendation_color` column to store the fixed hex colour
  associated with each recommendation tier returned by the AI.

  ## Changes
  - `ai_rankings_player_recos`: new column `recommendation_color` (text, nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_rankings_player_recos'
    AND column_name = 'recommendation_color'
  ) THEN
    ALTER TABLE ai_rankings_player_recos ADD COLUMN recommendation_color text;
  END IF;
END $$;
