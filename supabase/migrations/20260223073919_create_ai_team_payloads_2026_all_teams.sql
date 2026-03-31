/*
  # Create afl.v_ai_team_payloads_2026_all_teams

  ## Problem
  The existing v_ai_team_payloads_2026_next_round only returns teams that have
  a fixture in the upcoming round (currently 10 rows). Teams without a scheduled
  next-round match are excluded, so generate-team-ai-summaries only writes ~10
  summaries instead of all 18.

  ## Solution
  Build a new view anchored on all 18 canonical teams from team_name_canonical,
  LEFT JOINing to the latest available form metrics from v_ai_team_match_features_2026
  (using each team's most recent round). This guarantees exactly 18 rows regardless
  of the fixture schedule.

  ## Data Strategy
  - Use DISTINCT canonical_name from afl.team_name_canonical as the 18-team spine
  - For each team, take the latest round_number row from v_ai_team_match_features_2026
    as the best available form proxy
  - Opponent, venue, match_id, match_date are NULL for teams without a next fixture
    (edge function will handle gracefully)
  - All numeric metrics (season_avg, last_5_avg, predicted_score, floor, ceiling,
    stdev, confidence) are real values from 2025 form data

  ## Output columns
  - team (canonical name)
  - season (2026)
  - round_number (latest available)
  - season_avg, last_5_avg, last_10_avg, weighted_form, momentum
  - predicted_score, floor, ceiling, stdev_last_10, confidence_bucket
  - avg_allowed_season, avg_allowed_last_5
  - total_games_available, sample_size_used
  - payload (JSONB — same structure as next_round view for edge function compatibility)
*/

CREATE OR REPLACE VIEW afl.v_ai_team_payloads_2026_all_teams AS
WITH all_teams AS (
  SELECT DISTINCT canonical_name AS team
  FROM afl.team_name_canonical
),
latest_features AS (
  SELECT DISTINCT ON (team)
    team,
    season,
    round_number,
    season_avg_fantasy          AS season_avg,
    last_5_avg_fantasy          AS last_5_avg,
    last_10_avg_fantasy         AS last_10_avg,
    weighted_form,
    momentum,
    avg_allowed_last_5,
    avg_allowed_season,
    stdev_last_10,
    floor_p10_last_10           AS floor,
    ceiling_p90_last_10         AS ceiling,
    predicted_score,
    confidence_bucket,
    sample_size_used,
    total_games_available
  FROM afl.v_ai_team_match_features_2026
  ORDER BY team, round_number DESC
)
SELECT
  t.team,
  COALESCE(f.season, 2026)                          AS season,
  COALESCE(f.round_number, 0)                       AS round_number,
  f.season_avg,
  f.last_5_avg,
  f.last_10_avg,
  f.weighted_form,
  f.momentum,
  f.avg_allowed_last_5,
  f.avg_allowed_season,
  f.stdev_last_10,
  f.floor,
  f.ceiling,
  f.predicted_score,
  f.confidence_bucket,
  f.sample_size_used,
  f.total_games_available,
  jsonb_build_object(
    'team', jsonb_build_object(
      'name',     t.team,
      'opponent', NULL,
      'is_home',  NULL
    ),
    'match', jsonb_build_object(
      'match_id',   NULL,
      'match_date', NULL,
      'round',      COALESCE(f.round_number, 0),
      'venue',      NULL
    ),
    'form', jsonb_build_object(
      'season_avg',    f.season_avg,
      'last_5_avg',    f.last_5_avg,
      'last_10_avg',   f.last_10_avg,
      'weighted_form', f.weighted_form,
      'momentum',      f.momentum
    ),
    'defense', jsonb_build_object(
      'avg_allowed_last_5',  f.avg_allowed_last_5,
      'avg_allowed_season',  f.avg_allowed_season
    ),
    'volatility', jsonb_build_object(
      'stdev',    f.stdev_last_10,
      'floor',    f.floor,
      'ceiling',  f.ceiling
    ),
    'rest', jsonb_build_object(
      'days_rest',        NULL,
      'quick_turnaround', NULL
    ),
    'context', jsonb_build_object(
      'home_ground_advantage', NULL,
      'sample_size',           f.sample_size_used,
      'games_available',       f.total_games_available
    ),
    'prediction', jsonb_build_object(
      'predicted_score',  f.predicted_score,
      'predicted_margin', NULL,
      'confidence',       f.confidence_bucket
    )
  ) AS payload
FROM all_teams t
LEFT JOIN latest_features f ON f.team = t.team;
