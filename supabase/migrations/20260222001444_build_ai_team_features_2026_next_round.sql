/*
  # Section 2 — Team AI Features View: afl.v_ai_team_features_2026_next_round

  Alias view on top of the existing verified v_ai_team_match_features_2026_next_round.
  Renames columns to match the requested spec without breaking the upstream view.

  Columns delivered:
  - team, opponent, match_id, match_date, venue, round_number, is_home
  - Form: last_5_avg, last_10_avg, season_avg, weighted_form, momentum
  - Defense: avg_allowed_last_5, avg_allowed_season
  - Volatility: stdev_last_10, floor, ceiling
  - Rest: days_rest, quick_turnaround_flag
  - Context: home_ground_advantage
  - Output: predicted_score, predicted_margin, confidence_bucket

  predicted_margin is derived as: (home predicted_score) - (away predicted_score)
  We compute it by self-joining on match_id.
*/

CREATE OR REPLACE VIEW afl.v_ai_team_features_2026_next_round AS
WITH base AS (
  SELECT
    f.season,
    f.round_number,
    f.match_id,
    f.match_date,
    f.venue,
    f.team,
    f.opponent,
    f.is_home,
    f.home_ground_advantage_flag                    AS home_ground_advantage,
    f.days_rest,
    f.quick_turnaround_flag,
    f.last_5_avg_fantasy                            AS last_5_avg,
    f.last_10_avg_fantasy                           AS last_10_avg,
    f.season_avg_fantasy                            AS season_avg,
    f.weighted_form,
    f.momentum,
    f.avg_allowed_last_5,
    f.avg_allowed_season,
    f.stdev_last_10,
    f.floor_p10_last_10                             AS floor,
    f.ceiling_p90_last_10                           AS ceiling,
    f.predicted_score,
    f.predicted_change,
    f.confidence_bucket,
    f.sample_size_used,
    f.total_games_available
  FROM afl.v_ai_team_match_features_2026_next_round f
),

margins AS (
  SELECT
    h.match_id,
    h.predicted_score - a.predicted_score          AS predicted_margin
  FROM base h
  JOIN base a ON a.match_id = h.match_id AND a.is_home = FALSE
  WHERE h.is_home = TRUE
)

SELECT
  b.season,
  b.round_number,
  b.match_id,
  b.match_date,
  b.venue,
  b.team,
  b.opponent,
  b.is_home,
  b.home_ground_advantage,
  b.days_rest,
  b.quick_turnaround_flag,
  b.last_5_avg,
  b.last_10_avg,
  b.season_avg,
  b.weighted_form,
  b.momentum,
  b.avg_allowed_last_5,
  b.avg_allowed_season,
  b.stdev_last_10,
  b.floor,
  b.ceiling,
  b.predicted_score,
  CASE
    WHEN b.is_home  THEN  COALESCE(m.predicted_margin, 0)
    ELSE                 -COALESCE(m.predicted_margin, 0)
  END                                               AS predicted_margin,
  b.confidence_bucket,
  b.sample_size_used,
  b.total_games_available
FROM base b
LEFT JOIN margins m ON m.match_id = b.match_id;
