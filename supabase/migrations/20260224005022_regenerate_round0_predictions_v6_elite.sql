/*
  # Regenerate Round 0 Predictions — V6 Elite Engine

  ## Summary
  Deletes stale Round 0 / 2026 predictions and re-inserts fresh values
  calculated directly from the upgraded v_match_prediction_features_true_game
  view (V6 Elite engine with fixed ladder join and win rate bonus).

  ## No OpenAI dependency
  This migration backfills the numeric columns only:
    - predicted_home_score, predicted_away_score, predicted_margin
    - predicted_total, prediction, confidence
    - prediction_explanation (rich dynamic text using all V6 factors)

  The ai_summary column is populated by the edge function on next cron run.

  ## Safety
  - DELETE only targets season=2026 round_number=0
  - No other rows touched
  - Uses INSERT with ON CONFLICT DO UPDATE (idempotent)
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
  v.match_id,
  v.home_team,
  v.away_team,
  v.round_number,
  v.season,
  v.projected_home_score,
  v.projected_away_score,
  v.projected_margin,
  round(v.projected_home_score + v.projected_away_score, 1),
  v.projected_margin,
  round(v.model_confidence)::text,

  -- V6 rich dynamic explanation
  (
    CASE
      WHEN v.projected_home_score >= v.projected_away_score THEN v.home_team
      ELSE v.away_team
    END
    || ' favoured by '
    || round(abs(v.projected_margin), 1)::text
    || ' pts ('
    || CASE
         WHEN abs(v.projected_margin) <= 6  THEN 'coin-flip contest'
         WHEN abs(v.projected_margin) <= 15 THEN 'moderate advantage'
         WHEN abs(v.projected_margin) <= 28 THEN 'clear favourite scenario'
         ELSE 'dominant favourite scenario'
       END
    || '). Win probability: '
    || v.home_team || ' ' || round(v.win_probability_home * 100)::text || '% · '
    || v.away_team || ' ' || round(v.win_probability_away * 100)::text || '%. '

    || 'Scoring model: '
    || v.home_team || ' ' || round(v.home_points_for_avg, 1)::text || ' pts avg vs '
    || v.away_team || ' defence conceding ' || round(v.home_points_against_avg, 1)::text || ' avg. '
    || v.away_team || ' ' || round(v.away_points_for_avg, 1)::text || ' pts avg vs '
    || v.home_team || ' defence conceding ' || round(v.away_points_against_avg, 1)::text || ' avg. '

    || 'Ladder strength: '
    || v.home_team || ' position ' || v.home_ladder_position::text
    || ' (bonus ' || CASE WHEN v.home_ladder_adj >= 0 THEN '+' ELSE '' END || v.home_ladder_adj::text || '). '
    || v.away_team || ' position ' || v.away_ladder_position::text
    || ' (bonus ' || CASE WHEN v.away_ladder_adj >= 0 THEN '+' ELSE '' END || v.away_ladder_adj::text || '). '

    || 'Win rate: '
    || v.home_team || ' ' || round(v.home_win_rate * 100)::text || '% (bonus '
    || CASE WHEN v.home_win_rate_bonus >= 0 THEN '+' ELSE '' END || round(v.home_win_rate_bonus, 1)::text || ') · '
    || v.away_team || ' ' || round(v.away_win_rate * 100)::text || '% (bonus '
    || CASE WHEN v.away_win_rate_bonus >= 0 THEN '+' ELSE '' END || round(v.away_win_rate_bonus, 1)::text || '). '

    || 'Recent form: '
    || v.home_team || ' '
    || CASE
         WHEN v.home_momentum >= 4  THEN 'improving (+'
         WHEN v.home_momentum >= 1  THEN 'slightly up (+'
         WHEN v.home_momentum <= -4 THEN 'declining ('
         WHEN v.home_momentum <= -1 THEN 'slightly down ('
         ELSE 'stable ('
       END
    || round(v.home_momentum, 1)::text || ') · '
    || v.away_team || ' '
    || CASE
         WHEN v.away_momentum >= 4  THEN 'improving (+'
         WHEN v.away_momentum >= 1  THEN 'slightly up (+'
         WHEN v.away_momentum <= -4 THEN 'declining ('
         WHEN v.away_momentum <= -1 THEN 'slightly down ('
         ELSE 'stable ('
       END
    || round(v.away_momentum, 1)::text || '). '

    || 'Strength differential: ' || round(abs(v.strength_diff), 1)::text || ' pts. '
    || 'Confidence: ' || round(v.model_confidence)::text || '% — '
    || CASE
         WHEN v.model_confidence >= 80 THEN 'high (clear edge detected)'
         WHEN v.model_confidence >= 65 THEN 'moderate (competitive matchup)'
         ELSE 'low (near-even contest)'
       END
    || '. Home ground bonus: +6 pts to ' || v.home_team || '. '
    || 'Model: V6 Elite (55% season avg + 45% opponent defence + home + form + win rate + ladder + logistic probability).'
  ),

  now()
FROM afl.v_match_prediction_features_true_game v
ON CONFLICT (match_id) DO UPDATE SET
  predicted_home_score   = EXCLUDED.predicted_home_score,
  predicted_away_score   = EXCLUDED.predicted_away_score,
  predicted_margin       = EXCLUDED.predicted_margin,
  predicted_total        = EXCLUDED.predicted_total,
  prediction             = EXCLUDED.prediction,
  confidence             = EXCLUDED.confidence,
  prediction_explanation = EXCLUDED.prediction_explanation,
  updated_at             = EXCLUDED.updated_at;
