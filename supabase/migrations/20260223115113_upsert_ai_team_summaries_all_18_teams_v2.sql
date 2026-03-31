/*
  # Populate ai_team_summaries — All 18 Teams (season 2026)

  ## Problem
  ai_team_summaries had 10 rows. 8 teams missing (no unique constraint exists
  so ON CONFLICT cannot be used directly).

  ## Approach
  - DELETE only season=2026 rows (other seasons untouched)
  - INSERT all 18 teams from v_ai_team_match_features_2026_next_round
  - Summary built from real form metrics; flagged as baseline pending AI enrichment

  ## Safety
  - Only season = 2026 is deleted/replaced
  - No other seasons or tables are affected
*/

DELETE FROM afl.ai_team_summaries WHERE season = 2026;

INSERT INTO afl.ai_team_summaries (team, season, round_number, summary, updated_at)
SELECT
  f.team,
  f.season,
  f.round_number,
  'Season avg: ' || COALESCE(f.season_avg_fantasy::text, 'N/A') ||
  ' | Last 5 avg: ' || COALESCE(f.last_5_avg_fantasy::text, 'N/A') ||
  ' | Weighted form: ' || COALESCE(f.weighted_form::text, 'N/A') ||
  ' | Predicted score: ' || COALESCE(f.predicted_score::text, 'N/A') ||
  ' | Confidence: ' || COALESCE(f.confidence_bucket, 'N/A') ||
  ' | Next opponent: ' || COALESCE(f.opponent, 'N/A') ||
  ' | Venue: ' || COALESCE(f.venue, 'N/A') ||
  ' | [Auto-generated baseline — awaiting AI enrichment]' AS summary,
  now() AS updated_at
FROM afl.v_ai_team_match_features_2026_next_round f;
