
/*
  # Phase 1b: Signal Engine — Generation Function

  ## Summary
  Creates afl.fn_generate_player_signals() which computes all 23 signal types
  from existing data in player_rankings_cache, player_projection, player_breakout_model,
  and player_price_history. Writes results to afl.player_signals using UPSERT.

  ## Signal Logic

  VALUE (4 signals):
  - undervalued:       value_score >= p75 of value_score distribution
  - overvalued:        value_score <= p15 AND price > $200k
  - price_momentum:    price has increased over last 2 price snapshots
  - breakout_value:    undervalued + breakout_candidate (combined)

  TREND (4 signals):
  - hot_form:          form_score > 65 (above average performance)
  - cold_form:         form_score < 35
  - rising_projection: projection > season avg by 10%+
  - falling_projection: projection < season avg by 10%+

  RISK (3 signals):
  - high_volatility:   volatility_score >= p75 (projection varies wildly)
  - low_floor:         floor_estimate <= p20 of floor distribution
  - role_instability:  stability_score <= p25

  MATCHUP (3 signals):
  - favorable_matchup: matchup_multiplier >= 1.10
  - difficult_matchup: matchup_multiplier <= 0.90
  - positional_advantage: position_concession_multiplier >= 1.08

  CONSISTENCY (4 signals):
  - high_consistency:  consistency >= p75
  - low_consistency:   consistency <= p25
  - ceiling_heavy:     (ceiling - projection) / projection >= 0.25
  - floor_heavy:       (projection - floor) / projection <= 0.10

  OPPORTUNITY (3 signals):
  - breakout_candidate:  breakout_probability >= 0.35
  - bounce_back:         form_score < 45 AND consistency >= 0.55 (good player in bad form)
  - regression_candidate: form_score > 75 AND consistency < 0.5 (hot but unreliable)

  AI (3 signals):
  - ai_strong_buy:     recommendation_color = 'green' AND confidence >= 0.7
  - ai_avoid:          recommendation_color = 'red' AND confidence >= 0.7
  - ai_high_confidence: projection_confidence >= 75
*/

CREATE OR REPLACE FUNCTION afl.fn_generate_player_signals(
  p_snapshot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public', 'admin'
AS $$
DECLARE
  v_snapshot_id  uuid;
  v_signals_written integer := 0;
  v_players_processed integer := 0;

  -- percentile cutoffs computed once
  v_vs_p75       numeric;
  v_vs_p15       numeric;
  v_floor_p20    numeric;
  v_cons_p75     numeric;
  v_cons_p25     numeric;
  v_vol_p75      numeric;
  v_stab_p25     numeric;
BEGIN
  -- Use live snapshot if none provided
  IF p_snapshot_id IS NULL THEN
    SELECT snapshot_id INTO v_snapshot_id
    FROM admin.snapshots WHERE is_live = true
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_snapshot_id := p_snapshot_id;
  END IF;

  -- Compute distribution cutoffs from rankings cache
  SELECT
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score),
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY value_score),
    PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY COALESCE(floor_estimate, floor)),
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY consistency),
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY consistency)
  INTO v_vs_p75, v_vs_p15, v_floor_p20, v_cons_p75, v_cons_p25
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL;

  SELECT
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY volatility_score),
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY stability_score)
  INTO v_vol_p75, v_stab_p25
  FROM afl.player_projection
  WHERE volatility_score IS NOT NULL;

  -- Clear existing signals for this snapshot (idempotent re-run)
  DELETE FROM afl.player_signals
  WHERE snapshot_id = v_snapshot_id
     OR (snapshot_id IS NULL AND v_snapshot_id IS NULL);

  -- ─────────────────────────────────────────────────────────────────────────
  -- INSERT ALL SIGNALS IN ONE PASS using a CTE chain
  -- ─────────────────────────────────────────────────────────────────────────
  WITH
  -- Base data join
  base AS (
    SELECT
      r.player_id,
      r.player_name,
      r.team,
      r.position,
      r.projection,
      r.projection_final,
      r.ceiling,
      r.floor,
      r.ceiling_estimate,
      r.floor_estimate,
      r.consistency,
      r.form_score,
      r.neeko_rating,
      r.price,
      r.value_score,
      r.projection_confidence,
      r.risk_rating,
      r.matchup_rating,
      r.matchup_multiplier,
      r.upside_pct,
      r.recommendation_color,
      r.recommendation_strength,
      r.confidence_label,
      r.games_played,
      -- projection table extras
      pp.volatility_score,
      pp.stability_score,
      pp.form_rating,
      pp.position_concession_multiplier,
      pp.pace_multiplier,
      -- breakout model
      bm.breakout_probability,
      bm.breakout_flag,
      bm.recent_trend,
      bm.ceiling_hit_rate,
      -- latest price change
      (
        SELECT ph2.price - ph1.price
        FROM afl.player_price_history ph1
        JOIN afl.player_price_history ph2
          ON ph2.player_id = r.player_id
          AND ph2.round_number = ph1.round_number + 1
          AND ph2.season = ph1.season
        WHERE ph1.player_id = r.player_id
        ORDER BY ph1.season DESC, ph1.round_number DESC
        LIMIT 1
      ) AS price_delta
    FROM afl.player_rankings_cache r
    LEFT JOIN afl.player_projection pp ON pp.player_id = r.player_id
    LEFT JOIN afl.player_breakout_model bm ON bm.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
  ),

  -- ── VALUE SIGNALS ──────────────────────────────────────────────────────
  sig_undervalued AS (
    SELECT player_id, v_snapshot_id AS snapshot_id,
      'undervalued'::text AS signal_type,
      LEAST(100, 50 + (value_score - v_vs_p75) * 3)::numeric(5,2) AS signal_score,
      CASE WHEN value_score >= v_vs_p75 * 1.5 THEN 'strong'
           WHEN value_score >= v_vs_p75 * 1.2 THEN 'moderate' ELSE 'weak' END AS signal_strength,
      'positive'::text AS signal_direction,
      'Projection of ' || ROUND(COALESCE(projection_final, projection)::numeric, 0) ||
        ' pts significantly exceeds price of $' || (price / 1000) || 'k — strong value play.' AS explanation,
      LEAST(1.0, 0.5 + (value_score - v_vs_p75) / 50.0)::numeric(4,3) AS confidence,
      jsonb_build_object('value_score', value_score, 'price', price, 'projection', COALESCE(projection_final, projection)) AS metadata
    FROM base WHERE COALESCE(value_score, 0) >= v_vs_p75 AND COALESCE(price, 0) > 0
  ),
  sig_overvalued AS (
    SELECT player_id, v_snapshot_id,
      'overvalued'::text,
      LEAST(100, 50 + (v_vs_p15 - value_score) * 2)::numeric(5,2),
      CASE WHEN value_score <= v_vs_p15 * 0.5 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'Price of $' || (price / 1000) || 'k appears too high for projected output of ' ||
        ROUND(COALESCE(projection_final, projection)::numeric, 0) || ' pts.' AS explanation,
      0.65::numeric(4,3),
      jsonb_build_object('value_score', value_score, 'price', price, 'projection', COALESCE(projection_final, projection))
    FROM base WHERE COALESCE(value_score, 0) <= v_vs_p15 AND COALESCE(price, 0) >= 200000
  ),
  sig_price_momentum AS (
    SELECT player_id, v_snapshot_id,
      'price_momentum'::text,
      LEAST(100, 50 + price_delta / 1000.0)::numeric(5,2),
      CASE WHEN price_delta >= 20000 THEN 'strong'
           WHEN price_delta >= 5000  THEN 'moderate' ELSE 'weak' END,
      CASE WHEN price_delta > 0 THEN 'positive' ELSE 'negative' END,
      CASE WHEN price_delta > 0
        THEN 'Price rising — up $' || (price_delta / 1000) || 'k last round. Buy before further increases.'
        ELSE 'Price falling — down $' || ABS(price_delta / 1000) || 'k. Monitor for floor.' END,
      0.70::numeric(4,3),
      jsonb_build_object('price_delta', price_delta, 'current_price', price)
    FROM base WHERE price_delta IS NOT NULL AND ABS(price_delta) >= 3000
  ),
  sig_breakout_value AS (
    SELECT player_id, v_snapshot_id,
      'breakout_value'::text,
      LEAST(100, 60 + COALESCE(breakout_probability, 0) * 40)::numeric(5,2),
      'strong'::text,
      'positive'::text,
      'Undervalued player showing breakout signals — ideal buy-low opportunity this round.',
      LEAST(0.90, 0.6 + COALESCE(breakout_probability, 0) * 0.3)::numeric(4,3),
      jsonb_build_object('value_score', value_score, 'breakout_probability', breakout_probability)
    FROM base
    WHERE COALESCE(value_score, 0) >= v_vs_p75 * 0.9
      AND COALESCE(breakout_flag, false) = true
  ),

  -- ── TREND SIGNALS ──────────────────────────────────────────────────────
  sig_hot_form AS (
    SELECT player_id, v_snapshot_id,
      'hot_form'::text,
      LEAST(100, (form_score - 50) * 2)::numeric(5,2),
      CASE WHEN form_score >= 80 THEN 'strong'
           WHEN form_score >= 65 THEN 'moderate' ELSE 'weak' END,
      'positive'::text,
      'Form score of ' || ROUND(form_score::numeric, 0) || ' — significantly above average. Riding a hot streak.',
      LEAST(0.85, 0.5 + (form_score - 65) / 100.0)::numeric(4,3),
      jsonb_build_object('form_score', form_score)
    FROM base WHERE COALESCE(form_score, 0) >= 65
  ),
  sig_cold_form AS (
    SELECT player_id, v_snapshot_id,
      'cold_form'::text,
      LEAST(100, (50 - form_score) * 2)::numeric(5,2),
      CASE WHEN form_score <= 25 THEN 'strong'
           WHEN form_score <= 35 THEN 'moderate' ELSE 'weak' END,
      'negative'::text,
      'Form score of ' || ROUND(form_score::numeric, 0) || ' — well below average. Player underperforming recently.',
      LEAST(0.85, 0.5 + (35 - form_score) / 80.0)::numeric(4,3),
      jsonb_build_object('form_score', form_score)
    FROM base WHERE COALESCE(form_score, 100) <= 35
  ),
  sig_rising_projection AS (
    SELECT player_id, v_snapshot_id,
      'rising_projection'::text,
      LEAST(100, 50 + COALESCE(recent_trend, 0) * 5)::numeric(5,2),
      CASE WHEN COALESCE(recent_trend, 0) >= 0.15 THEN 'strong'
           ELSE 'moderate' END,
      'positive'::text,
      'Projection trending upward — recent games suggest above-average output. Model increasing confidence.',
      0.70::numeric(4,3),
      jsonb_build_object('recent_trend', recent_trend, 'projection', COALESCE(projection_final, projection))
    FROM base WHERE COALESCE(recent_trend, 0) >= 0.10 AND COALESCE(games_played, 0) >= 1
  ),
  sig_falling_projection AS (
    SELECT player_id, v_snapshot_id,
      'falling_projection'::text,
      LEAST(100, 50 + ABS(COALESCE(recent_trend, 0)) * 5)::numeric(5,2),
      CASE WHEN COALESCE(recent_trend, 0) <= -0.15 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'Projection trending downward — recent form suggests output is declining. Model reducing estimate.',
      0.70::numeric(4,3),
      jsonb_build_object('recent_trend', recent_trend, 'projection', COALESCE(projection_final, projection))
    FROM base WHERE COALESCE(recent_trend, 0) <= -0.10 AND COALESCE(games_played, 0) >= 1
  ),

  -- ── RISK SIGNALS ───────────────────────────────────────────────────────
  sig_high_volatility AS (
    SELECT player_id, v_snapshot_id,
      'high_volatility'::text,
      LEAST(100, 50 + (volatility_score - COALESCE(v_vol_p75, 0.5)) * 60)::numeric(5,2),
      CASE WHEN volatility_score >= COALESCE(v_vol_p75, 0.5) * 1.4 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'High score variance — projection of ' || ROUND(COALESCE(projection_final, projection)::numeric, 0) ||
        ' could swing widely. Risky for captain/vice-captain.',
      0.75::numeric(4,3),
      jsonb_build_object('volatility_score', volatility_score, 'ceiling', ceiling_estimate, 'floor', floor_estimate)
    FROM base WHERE COALESCE(volatility_score, 0) >= COALESCE(v_vol_p75, 0.5)
  ),
  sig_low_floor AS (
    SELECT player_id, v_snapshot_id,
      'low_floor'::text,
      LEAST(100, 50 + (v_floor_p20 - COALESCE(floor_estimate, floor)) * 0.5)::numeric(5,2),
      CASE WHEN COALESCE(floor_estimate, floor) <= v_floor_p20 * 0.7 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'Floor of ' || ROUND(COALESCE(floor_estimate, floor)::numeric, 0) ||
        ' pts is dangerously low. High bust risk if conditions change.',
      0.70::numeric(4,3),
      jsonb_build_object('floor', COALESCE(floor_estimate, floor), 'projection', COALESCE(projection_final, projection))
    FROM base WHERE COALESCE(floor_estimate, floor) <= v_floor_p20 AND v_floor_p20 IS NOT NULL
  ),
  sig_role_instability AS (
    SELECT player_id, v_snapshot_id,
      'role_instability'::text,
      LEAST(100, 50 + (COALESCE(v_stab_p25, 0.5) - COALESCE(stability_score, 0.5)) * 80)::numeric(5,2),
      CASE WHEN COALESCE(stability_score, 0.5) <= COALESCE(v_stab_p25, 0.5) * 0.6 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'Role stability score is below league average — output may be unreliable if role changes.',
      0.65::numeric(4,3),
      jsonb_build_object('stability_score', stability_score)
    FROM base WHERE COALESCE(stability_score, 1.0) <= COALESCE(v_stab_p25, 0.5)
  ),

  -- ── MATCHUP SIGNALS ────────────────────────────────────────────────────
  sig_favorable_matchup AS (
    SELECT player_id, v_snapshot_id,
      'favorable_matchup'::text,
      LEAST(100, 50 + (matchup_multiplier::numeric - 1.0) * 250)::numeric(5,2),
      CASE WHEN matchup_multiplier >= 1.15 THEN 'strong'
           ELSE 'moderate' END,
      'positive'::text,
      'Matchup multiplier of ' || ROUND(matchup_multiplier::numeric, 2) ||
        'x — opponent concedes above-average scores to this position. Boost projection by ' ||
        ROUND((matchup_multiplier::numeric - 1.0) * 100, 0) || '%.',
      0.72::numeric(4,3),
      jsonb_build_object('matchup_multiplier', matchup_multiplier, 'matchup_label', matchup_label)
    FROM base WHERE COALESCE(matchup_multiplier::numeric, 1.0) >= 1.10
  ),
  sig_difficult_matchup AS (
    SELECT player_id, v_snapshot_id,
      'difficult_matchup'::text,
      LEAST(100, 50 + (1.0 - matchup_multiplier::numeric) * 250)::numeric(5,2),
      CASE WHEN matchup_multiplier <= 0.88 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'Matchup multiplier of ' || ROUND(matchup_multiplier::numeric, 2) ||
        'x — opponent limits this position. Reduce projection by ' ||
        ROUND((1.0 - matchup_multiplier::numeric) * 100, 0) || '%.',
      0.72::numeric(4,3),
      jsonb_build_object('matchup_multiplier', matchup_multiplier, 'matchup_label', matchup_label)
    FROM base WHERE COALESCE(matchup_multiplier::numeric, 1.0) <= 0.90
  ),
  sig_positional_advantage AS (
    SELECT player_id, v_snapshot_id,
      'positional_advantage'::text,
      LEAST(100, 50 + (COALESCE(position_concession_multiplier, 1.0) - 1.0) * 300)::numeric(5,2),
      'moderate'::text,
      'positive'::text,
      'Venue and positional conditions suit this player''s scoring style — additional upside expected.',
      0.65::numeric(4,3),
      jsonb_build_object('position_concession_multiplier', position_concession_multiplier, 'position', position)
    FROM base WHERE COALESCE(position_concession_multiplier, 1.0) >= 1.08
  ),

  -- ── CONSISTENCY SIGNALS ────────────────────────────────────────────────
  sig_high_consistency AS (
    SELECT player_id, v_snapshot_id,
      'high_consistency'::text,
      LEAST(100, 50 + (consistency - v_cons_p75) * 100)::numeric(5,2),
      CASE WHEN consistency >= v_cons_p75 * 1.1 THEN 'strong'
           ELSE 'moderate' END,
      'positive'::text,
      'Consistency score of ' || ROUND(consistency::numeric, 2) ||
        ' — reliably delivers near-projection. Low variance player.',
      LEAST(0.85, 0.55 + consistency * 0.3)::numeric(4,3),
      jsonb_build_object('consistency', consistency, 'consistency_tier', consistency_tier)
    FROM base WHERE COALESCE(consistency, 0) >= v_cons_p75 AND v_cons_p75 IS NOT NULL
  ),
  sig_low_consistency AS (
    SELECT player_id, v_snapshot_id,
      'low_consistency'::text,
      LEAST(100, 50 + (v_cons_p25 - consistency) * 100)::numeric(5,2),
      CASE WHEN consistency <= v_cons_p25 * 0.7 THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      'Consistency score of ' || ROUND(consistency::numeric, 2) ||
        ' — high game-to-game variance. Avoid for safe rounds.',
      0.65::numeric(4,3),
      jsonb_build_object('consistency', consistency)
    FROM base WHERE COALESCE(consistency, 1) <= v_cons_p25 AND v_cons_p25 IS NOT NULL
  ),
  sig_ceiling_heavy AS (
    SELECT player_id, v_snapshot_id,
      'ceiling_heavy'::text,
      LEAST(100, 50 + (COALESCE(upside_pct, 0) - 25) * 1.5)::numeric(5,2),
      CASE WHEN COALESCE(upside_pct, 0) >= 40 THEN 'strong'
           ELSE 'moderate' END,
      'positive'::text,
      'Ceiling of ' || ROUND(COALESCE(ceiling_estimate, ceiling)::numeric, 0) ||
        ' pts (' || ROUND(COALESCE(upside_pct, 0)::numeric, 0) || '% above projection). Strong POD/captain option.',
      0.68::numeric(4,3),
      jsonb_build_object('ceiling', COALESCE(ceiling_estimate, ceiling), 'projection', COALESCE(projection_final, projection), 'upside_pct', upside_pct)
    FROM base
    WHERE COALESCE(upside_pct, 0) >= 25
      AND COALESCE(ceiling_estimate, ceiling) > 0
  ),
  sig_floor_heavy AS (
    SELECT player_id, v_snapshot_id,
      'floor_heavy'::text,
      LEAST(100,
        50 + CASE
          WHEN COALESCE(projection_final::numeric, projection::numeric, 1) > 0
          THEN (1.0 - (COALESCE(floor_estimate, floor)::numeric / NULLIF(COALESCE(projection_final::numeric, projection::numeric), 0))) * (-80)
          ELSE 0
        END
      )::numeric(5,2),
      'moderate'::text,
      'positive'::text,
      'Floor of ' || ROUND(COALESCE(floor_estimate, floor)::numeric, 0) ||
        ' pts is close to projection — reliable scorer with minimal bust risk.',
      0.72::numeric(4,3),
      jsonb_build_object('floor', COALESCE(floor_estimate, floor), 'projection', COALESCE(projection_final, projection))
    FROM base
    WHERE COALESCE(projection_final::numeric, projection::numeric, 0) > 0
      AND (COALESCE(floor_estimate, floor)::numeric / NULLIF(COALESCE(projection_final::numeric, projection::numeric), 0)) >= 0.85
  ),

  -- ── OPPORTUNITY SIGNALS ────────────────────────────────────────────────
  sig_breakout_candidate AS (
    SELECT player_id, v_snapshot_id,
      'breakout_candidate'::text,
      LEAST(100, 50 + COALESCE(breakout_probability, 0) * 60)::numeric(5,2),
      CASE WHEN COALESCE(breakout_probability, 0) >= 0.55 THEN 'strong'
           WHEN COALESCE(breakout_probability, 0) >= 0.40 THEN 'moderate'
           ELSE 'weak' END,
      'positive'::text,
      'Breakout probability of ' || ROUND(COALESCE(breakout_probability, 0)::numeric * 100, 0) ||
        '% — model detects conditions for significantly above-average output.',
      LEAST(0.85, 0.5 + COALESCE(breakout_probability, 0) * 0.5)::numeric(4,3),
      jsonb_build_object('breakout_probability', breakout_probability, 'breakout_index', bm.breakout_index, 'ceiling_hit_rate', ceiling_hit_rate)
    FROM base
    JOIN afl.player_breakout_model bm USING (player_id)
    WHERE COALESCE(breakout_probability, 0) >= 0.35
  ),
  sig_bounce_back AS (
    SELECT player_id, v_snapshot_id,
      'bounce_back'::text,
      LEAST(100, 50 + (consistency - 0.5) * 60 + (50 - form_score) * 0.5)::numeric(5,2),
      'moderate'::text,
      'positive'::text,
      'Consistent performer (score ' || ROUND(consistency::numeric, 2) ||
        ') in below-average form (' || ROUND(form_score::numeric, 0) ||
        '). Historical pattern suggests strong bounce-back likely.',
      0.68::numeric(4,3),
      jsonb_build_object('consistency', consistency, 'form_score', form_score)
    FROM base
    WHERE COALESCE(form_score, 100) < 45
      AND COALESCE(consistency, 0) >= 0.55
  ),
  sig_regression_candidate AS (
    SELECT player_id, v_snapshot_id,
      'regression_candidate'::text,
      LEAST(100, 50 + (form_score - 70) * 0.8 + (0.5 - consistency) * 60)::numeric(5,2),
      'moderate'::text,
      'negative'::text,
      'Running hot (form ' || ROUND(form_score::numeric, 0) ||
        ') but inconsistency score of ' || ROUND(consistency::numeric, 2) ||
        ' suggests this run may not last. Regression risk.',
      0.65::numeric(4,3),
      jsonb_build_object('form_score', form_score, 'consistency', consistency)
    FROM base
    WHERE COALESCE(form_score, 0) > 72
      AND COALESCE(consistency, 1) < 0.50
  ),

  -- ── AI SIGNALS ─────────────────────────────────────────────────────────
  sig_ai_strong_buy AS (
    SELECT player_id, v_snapshot_id,
      'ai_strong_buy'::text,
      LEAST(100, 70 + projection_confidence * 0.25)::numeric(5,2),
      CASE WHEN recommendation_strength = 'strong' THEN 'strong'
           ELSE 'moderate' END,
      'positive'::text,
      COALESCE(recommendation_short, 'AI model rates this player as a strong buy this round.'),
      LEAST(0.90, 0.65 + projection_confidence / 400.0)::numeric(4,3),
      jsonb_build_object('recommendation_color', recommendation_color, 'recommendation_short', recommendation_short, 'confidence_label', confidence_label)
    FROM base
    WHERE LOWER(COALESCE(recommendation_color, '')) IN ('green', 'emerald', 'lime')
      AND COALESCE(projection_confidence, 0) >= 68
  ),
  sig_ai_avoid AS (
    SELECT player_id, v_snapshot_id,
      'ai_avoid'::text,
      LEAST(100, 65 + projection_confidence * 0.20)::numeric(5,2),
      CASE WHEN recommendation_strength = 'strong' THEN 'strong'
           ELSE 'moderate' END,
      'negative'::text,
      COALESCE(recommendation_short, 'AI model flags this player as avoid this round.'),
      LEAST(0.88, 0.60 + projection_confidence / 400.0)::numeric(4,3),
      jsonb_build_object('recommendation_color', recommendation_color, 'recommendation_short', recommendation_short)
    FROM base
    WHERE LOWER(COALESCE(recommendation_color, '')) IN ('red', 'orange', 'rose')
      AND COALESCE(projection_confidence, 0) >= 65
  ),
  sig_ai_high_confidence AS (
    SELECT player_id, v_snapshot_id,
      'ai_high_confidence'::text,
      LEAST(100, projection_confidence)::numeric(5,2),
      CASE WHEN confidence_label = 'Elite' THEN 'strong'
           WHEN confidence_label = 'Strong' THEN 'moderate'
           ELSE 'weak' END,
      'positive'::text,
      'Projection confidence: ' || confidence_label || ' (' || ROUND(projection_confidence::numeric, 0) ||
        '/100). Model has high certainty about this player''s output.',
      LEAST(0.92, projection_confidence / 100.0)::numeric(4,3),
      jsonb_build_object('projection_confidence', projection_confidence, 'confidence_label', confidence_label)
    FROM base
    WHERE COALESCE(projection_confidence, 0) >= 75
  ),

  -- ── UNION ALL SIGNALS ──────────────────────────────────────────────────
  all_signals AS (
    SELECT * FROM sig_undervalued
    UNION ALL SELECT * FROM sig_overvalued
    UNION ALL SELECT * FROM sig_price_momentum
    UNION ALL SELECT * FROM sig_breakout_value
    UNION ALL SELECT * FROM sig_hot_form
    UNION ALL SELECT * FROM sig_cold_form
    UNION ALL SELECT * FROM sig_rising_projection
    UNION ALL SELECT * FROM sig_falling_projection
    UNION ALL SELECT * FROM sig_high_volatility
    UNION ALL SELECT * FROM sig_low_floor
    UNION ALL SELECT * FROM sig_role_instability
    UNION ALL SELECT * FROM sig_favorable_matchup
    UNION ALL SELECT * FROM sig_difficult_matchup
    UNION ALL SELECT * FROM sig_positional_advantage
    UNION ALL SELECT * FROM sig_high_consistency
    UNION ALL SELECT * FROM sig_low_consistency
    UNION ALL SELECT * FROM sig_ceiling_heavy
    UNION ALL SELECT * FROM sig_floor_heavy
    UNION ALL SELECT * FROM sig_breakout_candidate
    UNION ALL SELECT * FROM sig_bounce_back
    UNION ALL SELECT * FROM sig_regression_candidate
    UNION ALL SELECT * FROM sig_ai_strong_buy
    UNION ALL SELECT * FROM sig_ai_avoid
    UNION ALL SELECT * FROM sig_ai_high_confidence
  ),
  -- Clamp signal_score to valid range
  clamped AS (
    SELECT
      player_id, snapshot_id, signal_type,
      GREATEST(0, LEAST(100, COALESCE(signal_score, 0)))::numeric(5,2) AS signal_score,
      signal_strength, signal_direction, explanation,
      GREATEST(0, LEAST(1, COALESCE(confidence, 0.5)))::numeric(4,3) AS confidence,
      metadata
    FROM all_signals
    WHERE player_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO afl.player_signals
      (player_id, snapshot_id, signal_type, signal_score, signal_strength,
       signal_direction, explanation, confidence, metadata)
    SELECT player_id, snapshot_id, signal_type, signal_score, signal_strength,
           signal_direction, explanation, confidence, metadata
    FROM clamped
    ON CONFLICT (player_id, signal_type,
      COALESCE(snapshot_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      signal_score     = EXCLUDED.signal_score,
      signal_strength  = EXCLUDED.signal_strength,
      signal_direction = EXCLUDED.signal_direction,
      explanation      = EXCLUDED.explanation,
      confidence       = EXCLUDED.confidence,
      metadata         = EXCLUDED.metadata,
      created_at       = now()
    RETURNING player_id
  )
  SELECT COUNT(*) INTO v_signals_written FROM inserted;

  SELECT COUNT(DISTINCT player_id) INTO v_players_processed FROM afl.player_signals
  WHERE snapshot_id = v_snapshot_id OR snapshot_id IS NULL;

  RETURN jsonb_build_object(
    'ok',                true,
    'signals_written',   v_signals_written,
    'players_processed', v_players_processed,
    'snapshot_id',       v_snapshot_id,
    'signal_types',      24,
    'generated_at',      NOW()
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    false,
    'error', SQLERRM,
    'hint',  SQLSTATE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_generate_player_signals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION afl.fn_generate_player_signals(uuid) TO authenticated;

-- Run immediately to populate signals
SELECT afl.fn_generate_player_signals(NULL);
