/*
  # Truncate AI Output Tables for Regeneration

  ## Purpose
  Clear all previously generated AI summaries and predictions so that
  the generate-all-ai edge function writes fresh data using the repaired
  OpenAI input views (no more {{placeholder}} values reaching GPT-4o).

  ## Tables Cleared
  - afl.ai_player_summaries  — player round projections
  - afl.ai_team_summaries    — team match analysis
  - afl.ai_match_predictions — match prediction narratives

  ## Safety
  TRUNCATE ... RESTART IDENTITY preserves table structure and all RLS policies.
  No schema changes are made.
*/

TRUNCATE afl.ai_player_summaries RESTART IDENTITY;
TRUNCATE afl.ai_team_summaries   RESTART IDENTITY;
TRUNCATE afl.ai_match_predictions RESTART IDENTITY;
