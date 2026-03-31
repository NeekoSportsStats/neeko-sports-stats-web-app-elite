/*
  # Create afl.v_pipeline_health Dashboard View

  ## Purpose
  Single query to assess the health of all AI pipeline outputs.
  Useful for monitoring, debugging, and cron health checks.

  ## Columns
  - player_count: total rows in ai_player_summaries
  - team_count: total rows in ai_team_summaries (season 2026)
  - match_count: total rows in ai_match_predictions
  - match_missing_numeric: predictions where predicted_home_score IS NULL
  - last_player_update: most recent updated_at in ai_player_summaries
  - last_team_update: most recent updated_at in ai_team_summaries
  - last_match_update: most recent updated_at in ai_match_predictions

  ## Expected healthy state
  - player_count: ~780
  - team_count: 18
  - match_count: >= 5
  - match_missing_numeric: 0
*/

CREATE OR REPLACE VIEW afl.v_pipeline_health AS
SELECT
  (SELECT count(*) FROM afl.ai_player_summaries)                                              AS player_count,
  (SELECT count(*) FROM afl.ai_team_summaries WHERE season = 2026)                           AS team_count,
  (SELECT count(*) FROM afl.ai_match_predictions)                                             AS match_count,
  (SELECT count(*) FROM afl.ai_match_predictions WHERE predicted_home_score IS NULL)          AS match_missing_numeric,
  (SELECT max(updated_at) FROM afl.ai_player_summaries)                                       AS last_player_update,
  (SELECT max(updated_at) FROM afl.ai_team_summaries)                                         AS last_team_update,
  (SELECT max(updated_at) FROM afl.ai_match_predictions)                                      AS last_match_update;
