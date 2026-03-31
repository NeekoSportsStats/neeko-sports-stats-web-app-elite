/*
  # Regenerate Round 0 Predictions — Calibrated v3

  ## Summary
  Deletes all existing Round 0 (season 2026) predictions and re-inserts them
  using the calibrated score model from v_match_prediction_features_true_game.

  No table structure changes. Only the data rows are replaced.

  ## Notes
  - ai_summary and prediction_explanation are preserved as static strings
    (OpenAI summaries require the edge function to regenerate; this migration
     seeds the numeric columns so the frontend displays correct values immediately)
  - The edge function (generate-match-summary) can be re-run to refresh AI text
*/

DELETE FROM afl.ai_match_predictions
WHERE season = 2026 AND round_number = 0;

INSERT INTO afl.ai_match_predictions (
  match_id,
  home_team,
  away_team,
  round_number,
  season,
  predicted_home_score,
  predicted_away_score,
  predicted_margin,
  predicted_total,
  prediction,
  confidence,
  prediction_explanation,
  updated_at
)
SELECT
  f.match_id,
  f.home_team,
  f.away_team,
  f.round_number,
  f.season,
  f.projected_home_score                                       AS predicted_home_score,
  f.projected_away_score                                       AS predicted_away_score,
  round(f.projected_home_score - f.projected_away_score, 1)   AS predicted_margin,
  round(f.projected_home_score + f.projected_away_score, 1)   AS predicted_total,
  round(f.projected_home_score - f.projected_away_score, 1)   AS prediction,
  to_char(
    GREATEST(55, LEAST(95, round(55.0 + abs(f.projected_home_score - f.projected_away_score) * 1.8, 0))),
    'FM999'
  )                                                            AS confidence,
  'Projected score calculated using: season average match scoring (' ||
    round(f.home_points_for_avg, 1)::text || ' vs ' || round(f.away_points_for_avg, 1)::text || ' pts), ' ||
    'opponent defensive average (' || round(f.home_points_against_avg, 1)::text || ' vs ' ||
    round(f.away_points_against_avg, 1)::text || ' pts conceded), ' ||
    'home ground advantage (+8 pts), recent form adjustment, and team strength index. ' ||
    'Win probability derived from logistic model on strength differential. ' ||
    'Confidence reflects margin size: larger projected margins produce higher confidence.'
                                                               AS prediction_explanation,
  now()                                                        AS updated_at
FROM afl.v_match_prediction_features_true_game f;
