/*
  # Add fantasy_verdict column to afl.ai_team_summaries

  ## Summary
  Adds a new nullable text column `fantasy_verdict` to the existing
  `afl.ai_team_summaries` table. This column stores the auto-extracted
  fantasy verdict label derived from the AI-generated Outlook sentence.

  ## New Column
  - `fantasy_verdict` (text, nullable) — One of: ELITE, STRONG, RELIABLE,
    NEUTRAL, VOLATILE, RISKY, AVOID. Populated by the
    generate-team-ai-summaries edge function on every upsert.

  ## Notes
  - Non-destructive: no existing columns are modified or removed.
  - No RLS changes needed; inherits existing table policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name   = 'ai_team_summaries'
      AND column_name  = 'fantasy_verdict'
  ) THEN
    ALTER TABLE afl.ai_team_summaries ADD COLUMN fantasy_verdict text;
  END IF;
END $$;
