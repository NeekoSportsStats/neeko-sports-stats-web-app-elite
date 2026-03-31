/*
  # Create v_neeko_intel_matches

  ## Purpose
  Powers the "Match Projections" section of the Neeko Intel page.

  ## Logic
  Sources from afl.ai_match_predictions (live prediction table).
  Deduplicates to the latest prediction per match_id.
  Derives a 'winner' field from predicted scores.
  Joins v_match_fixtures_2026 on home_team + away_team + round_number
  to surface the match kickoff timestamp.

  ## Fields
  - match_id, home_team, away_team, round_number, season
  - home_projection (predicted home score)
  - away_projection (predicted away score)
  - margin (absolute predicted margin)
  - confidence (HIGH / MEDIUM / LOW)
  - winner (predicted winning team name)
  - ai_summary, prediction_explanation
  - match_date (kickoff timestamp from fixtures if available)
  - updated_at (when prediction was last generated)

  ## Ordering
  round_number ASC, match_id ASC

  ## Schema
  public
*/

CREATE OR REPLACE VIEW public.v_neeko_intel_matches AS
WITH latest_predictions AS (
  SELECT DISTINCT ON (match_id)
    match_id,
    home_team,
    away_team,
    round_number,
    season,
    predicted_home_score,
    predicted_away_score,
    predicted_margin,
    confidence,
    ai_summary,
    prediction_explanation,
    updated_at
  FROM afl.ai_match_predictions
  ORDER BY match_id, updated_at DESC
)
SELECT
  lp.match_id,
  lp.home_team,
  lp.away_team,
  lp.predicted_home_score                 AS home_projection,
  lp.predicted_away_score                 AS away_projection,
  ABS(lp.predicted_margin)                AS margin,
  lp.confidence,
  CASE
    WHEN lp.predicted_home_score IS NULL OR lp.predicted_away_score IS NULL THEN NULL
    WHEN lp.predicted_home_score >= lp.predicted_away_score THEN lp.home_team
    ELSE lp.away_team
  END                                      AS winner,
  lp.ai_summary,
  lp.prediction_explanation,
  lp.round_number,
  lp.season,
  lp.updated_at,
  f.kickoff_at                             AS match_date
FROM latest_predictions lp
LEFT JOIN afl.v_match_fixtures_2026 f
  ON  f.home_team     = lp.home_team
  AND f.away_team     = lp.away_team
  AND f.round_number  = lp.round_number
ORDER BY lp.round_number ASC, lp.match_id ASC;
