/*
  # Section 3 — Match AI Features View: afl.v_ai_match_features_2026_next_round

  One row per upcoming match in the next round.

  Sources:
  - afl.v_ai_team_features_2026_next_round  — team-level predictions just built above

  Columns delivered:
  - match_id, match_date, venue, round_number, season
  - home_team, away_team
  - predicted_home_score, predicted_away_score
  - predicted_margin (home perspective: home - away)
  - predicted_total
  - confidence_home, confidence_away
*/

CREATE OR REPLACE VIEW afl.v_ai_match_features_2026_next_round AS
WITH home_side AS (
  SELECT
    season, round_number, match_id, match_date, venue,
    team         AS home_team,
    opponent     AS away_team,
    predicted_score      AS predicted_home_score,
    confidence_bucket    AS confidence_home,
    days_rest            AS home_days_rest,
    home_ground_advantage
  FROM afl.v_ai_team_features_2026_next_round
  WHERE is_home = TRUE
),
away_side AS (
  SELECT
    match_id,
    team         AS away_team_check,
    predicted_score      AS predicted_away_score,
    confidence_bucket    AS confidence_away,
    days_rest            AS away_days_rest
  FROM afl.v_ai_team_features_2026_next_round
  WHERE is_home = FALSE
)
SELECT
  h.season,
  h.round_number,
  h.match_id,
  h.match_date,
  h.venue,
  h.home_team,
  h.away_team,
  h.predicted_home_score,
  a.predicted_away_score,
  ROUND((h.predicted_home_score - a.predicted_away_score)::numeric, 1) AS predicted_margin,
  ROUND((h.predicted_home_score + a.predicted_away_score)::numeric, 1) AS predicted_total,
  h.confidence_home,
  a.confidence_away,
  h.home_days_rest,
  a.away_days_rest,
  h.home_ground_advantage
FROM home_side h
JOIN away_side a ON a.match_id = h.match_id;
