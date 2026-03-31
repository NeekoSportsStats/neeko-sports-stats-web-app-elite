/*
  # Archive Old AI Generation Infrastructure

  ## Summary
  Creates an archive_ai schema and moves the old AI generation input views
  (used only by the retired generation edge functions) into it.

  The READ tables (afl.ai_player_summaries, afl.ai_team_summaries,
  afl.ai_match_predictions) are intentionally kept in place because
  AFLAIInsightsPage.tsx still reads from them for the live AI Insights page.

  Only the OpenAI input/payload views that fed the old generation pipeline
  are archived — they have no frontend consumers.

  ## Archived Views (moved to archive_ai schema)
  - afl.v_ai_player_openai_inputs_2026_next_round
  - afl.v_ai_team_openai_inputs_2026_next_round
  - afl.v_ai_match_openai_inputs (afl schema)
  - afl.v_ai_team_openai_inputs_2026_all_teams

  ## Kept in Place (still read by frontend)
  - afl.ai_player_summaries
  - afl.ai_team_summaries
  - afl.ai_match_predictions
  - public.v_ai_player_summaries_preview
  - public.v_ai_team_summaries_preview
  - public.v_ai_match_predictions_preview

  ## Notes
  - No data is deleted
  - All archived objects are recoverable by moving back to afl schema
  - archive_ai schema is created with IF NOT EXISTS for safety
*/

CREATE SCHEMA IF NOT EXISTS archive_ai;

ALTER VIEW IF EXISTS afl.v_ai_player_openai_inputs_2026_next_round
  SET SCHEMA archive_ai;

ALTER VIEW IF EXISTS afl.v_ai_team_openai_inputs_2026_next_round
  SET SCHEMA archive_ai;

ALTER VIEW IF EXISTS afl.v_ai_match_openai_inputs
  SET SCHEMA archive_ai;

ALTER VIEW IF EXISTS afl.v_ai_team_openai_inputs_2026_all_teams
  SET SCHEMA archive_ai;
