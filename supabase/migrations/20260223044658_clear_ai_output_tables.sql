/*
  # Clear AI Output Tables — Safe Reset

  Truncates all three AI output tables to allow a clean regeneration.
  No tables are dropped or modified structurally.

  Tables cleared:
  - afl.ai_player_summaries
  - afl.ai_team_summaries
  - afl.ai_match_predictions
*/

TRUNCATE TABLE afl.ai_player_summaries;
TRUNCATE TABLE afl.ai_team_summaries;
TRUNCATE TABLE afl.ai_match_predictions;
