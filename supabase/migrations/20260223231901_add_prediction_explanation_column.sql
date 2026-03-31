/*
  # Add prediction_explanation column to ai_match_predictions

  ## Summary
  Adds a new text column `prediction_explanation` to store a tooltip-style
  explanation of how the projected score and win probability were calculated.

  ## Changes
  - ai_match_predictions: new nullable column `prediction_explanation`

  ## Notes
  - No existing columns renamed or removed
  - Existing frontend field names unchanged
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name = 'ai_match_predictions'
      AND column_name = 'prediction_explanation'
  ) THEN
    ALTER TABLE afl.ai_match_predictions
      ADD COLUMN prediction_explanation text;
  END IF;
END $$;
