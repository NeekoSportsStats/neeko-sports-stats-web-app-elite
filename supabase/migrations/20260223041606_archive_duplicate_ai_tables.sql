/*
  # Archive Duplicate AI Output Tables

  ## Summary
  Safe archival of 8 dead duplicate tables identified in forensic audit.
  All tables are confirmed empty (0 rows) and unreferenced by any edge function or frontend.

  ## Tables Archived (renamed, not deleted)

  ### AI Output Duplicates
  - `ai_match_summaries` → `archive_ai_match_summaries` (superseded by ai_match_predictions)
  - `ai_player_predictions` → `archive_ai_player_predictions` (superseded by ai_player_summaries)
  - `ai_team_predictions` → `archive_ai_team_predictions` (superseded by ai_team_summaries)
  - `ai_prediction_runs` → `archive_ai_prediction_runs` (superseded by ai_runs)
  - `match_predictions_2026` → `archive_match_predictions_2026` (superseded by ai_match_predictions)
  - `match_summaries_2026` → `archive_match_summaries_2026` (superseded by ai_match_predictions)

  ### Prompt Config Duplicates
  - `ai_prompt_config` → `archive_ai_prompt_config` (superseded by ai_prompts)
  - `ai_prompt_templates` → `archive_ai_prompt_templates` (superseded by ai_prompts)

  ## Active Production Tables — UNTOUCHED
  - afl.ai_player_summaries (779 rows)
  - afl.ai_team_summaries (28 rows)
  - afl.ai_match_predictions (5 rows)
  - afl.ai_prompts (4 rows)
  - afl.ai_runs (60 rows)

  ## Notes
  - All 8 tables confirmed 0 rows before archival
  - No edge functions write to any of these tables
  - No frontend reads from any of these tables
  - RENAME only — no data destroyed
*/

ALTER TABLE IF EXISTS afl.ai_match_summaries RENAME TO archive_ai_match_summaries;
ALTER TABLE IF EXISTS afl.ai_player_predictions RENAME TO archive_ai_player_predictions;
ALTER TABLE IF EXISTS afl.ai_team_predictions RENAME TO archive_ai_team_predictions;
ALTER TABLE IF EXISTS afl.ai_prediction_runs RENAME TO archive_ai_prediction_runs;
ALTER TABLE IF EXISTS afl.match_predictions_2026 RENAME TO archive_match_predictions_2026;
ALTER TABLE IF EXISTS afl.match_summaries_2026 RENAME TO archive_match_summaries_2026;
ALTER TABLE IF EXISTS afl.ai_prompt_config RENAME TO archive_ai_prompt_config;
ALTER TABLE IF EXISTS afl.ai_prompt_templates RENAME TO archive_ai_prompt_templates;
