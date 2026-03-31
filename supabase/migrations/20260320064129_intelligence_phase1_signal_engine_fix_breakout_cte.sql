
/*
  # Phase 1c: Fix signal engine — breakout_candidate CTE duplicate join

  The sig_breakout_candidate CTE incorrectly re-joined player_breakout_model
  with alias 'bm' when it was already available via the base CTE. This caused
  a column ambiguity error. Fixed by using the base CTE columns directly.
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
  v_snapshot_id      uuid;
  v_signals_written  integer := 0;
  v_players_processed integer := 0;
  v_vs_p75    numeric; v_vs_p15    numeric;
  v_floor_p20 numeric; v_cons_p75  numeric;
  v_cons_p25  numeric; v_vol_p75   numeric;
  v_stab_p25  numeric;
BEGIN
  -- Resolve snapshot
  IF p_snapshot_id IS NULL THEN
    SELECT snapshot_id INTO v_snapshot_id
    FROM admin.snapshots WHERE is_live = true
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_snapshot_id := p_snapshot_id;
  END IF;

  -- Distribution cutoffs
  SELECT
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score),
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY value_score),
    PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY COALESCE(floor_estimate, floor)),
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY consistency),
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY consistency)
  INTO v_vs_p75, v_vs_p15, v_floor_p20, v_cons_p75, v_cons_p25
  FROM afl.player_rankings_cache WHERE value_score IS NOT NULL;

  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY volatility_score), 0.5),
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY stability_score), 0.5)
  INTO v_vol_p75, v_stab_p25
  FROM afl.player_projection WHERE volatility_score IS NOT NULL;

  -- Clear old signals for this snapshot
  DELETE FROM afl.player_signals
  WHERE (snapshot_id = v_snapshot_id)
     OR (v_snapshot_id IS NULL AND snapshot_id IS NULL);

  -- ── Single-pass signal generation ──────────────────────────────────────
  WITH base AS (
    SELECT
      r.player_id, r.player_name, r.team, r.position,
      COALESCE(r.projection_final::double precision, r.projection) AS proj,
      r.ceiling, r.floor,
      COALESCE(r.ceiling_estimate, r.ceiling)                       AS ceil_est,
      COALESCE(r.floor_estimate,   r.floor)                         AS floor_est,
      r.consistency, r.form_score, r.neeko_rating,
      r.price, r.value_score, r.projection_confidence,
      r.matchup_rating, r.matchup_multiplier, r.matchup_label,
      r.upside_pct, r.recommendation_color, r.recommendation_strength,
      r.confidence_label, r.games_played,
      pp.volatility_score, pp.stability_score, pp.form_rating,
      pp.position_concession_multiplier,
      bm.breakout_probability, bm.breakout_flag, bm.breakout_index,
      bm.recent_trend, bm.ceiling_hit_rate,
      (
        SELECT ph2.price - ph1.price
        FROM   afl.player_price_history ph1
        JOIN   afl.player_price_history ph2
               ON ph2.player_id = r.player_id
              AND ph2.round_number = ph1.round_number + 1
              AND ph2.season = ph1.season
        WHERE  ph1.player_id = r.player_id
        ORDER  BY ph1.season DESC, ph1.round_number DESC
        LIMIT  1
      ) AS price_delta
    FROM afl.player_rankings_cache r
    LEFT JOIN afl.player_projection           pp ON pp.player_id = r.player_id
    LEFT JOIN afl.player_breakout_model       bm ON bm.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
  ),
  -- ── VALUE ──────────────────────────────────────────────────────────────
  s1 AS (
    SELECT player_id, v_snapshot_id AS sid, 'undervalued' AS t,
      LEAST(100, GREATEST(0, 50 + (value_score - v_vs_p75) * 3))::numeric(5,2) AS sc,
      CASE WHEN value_score >= v_vs_p75 * 1.5 THEN 'strong'
           WHEN value_score >= v_vs_p75 * 1.2 THEN 'moderate' ELSE 'weak' END AS ss,
      'positive' AS sd,
      'Projection of ' || ROUND(proj::numeric,0) || ' pts exceeds price of $' || (price/1000) || 'k — strong value.' AS ex,
      LEAST(1.0, GREATEST(0, 0.5 + (value_score - v_vs_p75) / 50.0))::numeric(4,3) AS cn,
      jsonb_build_object('value_score',value_score,'price',price,'projection',ROUND(proj::numeric,1)) AS md
    FROM base WHERE COALESCE(value_score,0) >= v_vs_p75 AND COALESCE(price,0) > 0
  ),
  s2 AS (
    SELECT player_id, v_snapshot_id, 'overvalued',
      LEAST(100, GREATEST(0, 50 + (v_vs_p15 - value_score) * 2))::numeric(5,2),
      CASE WHEN value_score <= v_vs_p15*0.5 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'Price of $' || (price/1000) || 'k too high for projected ' || ROUND(proj::numeric,0) || ' pts.',
      0.65::numeric(4,3),
      jsonb_build_object('value_score',value_score,'price',price,'projection',ROUND(proj::numeric,1))
    FROM base WHERE COALESCE(value_score,0) <= v_vs_p15 AND COALESCE(price,0) >= 200000
  ),
  s3 AS (
    SELECT player_id, v_snapshot_id, 'price_momentum',
      LEAST(100, GREATEST(0, 50 + price_delta / 1000.0))::numeric(5,2),
      CASE WHEN ABS(price_delta) >= 20000 THEN 'strong'
           WHEN ABS(price_delta) >= 5000  THEN 'moderate' ELSE 'weak' END,
      CASE WHEN price_delta > 0 THEN 'positive' ELSE 'negative' END,
      CASE WHEN price_delta > 0 THEN 'Price rising — up $' || (price_delta/1000) || 'k last round.'
           ELSE 'Price falling — down $' || ABS(price_delta/1000) || 'k last round.' END,
      0.70::numeric(4,3),
      jsonb_build_object('price_delta',price_delta,'current_price',price)
    FROM base WHERE price_delta IS NOT NULL AND ABS(price_delta) >= 3000
  ),
  s4 AS (
    SELECT player_id, v_snapshot_id, 'breakout_value',
      LEAST(100, GREATEST(0, 60 + COALESCE(breakout_probability,0)*40))::numeric(5,2),
      'strong', 'positive',
      'Undervalued player with breakout signals — ideal buy-low this round.',
      LEAST(1.0, GREATEST(0, 0.6 + COALESCE(breakout_probability,0)*0.3))::numeric(4,3),
      jsonb_build_object('value_score',value_score,'breakout_prob',breakout_probability)
    FROM base WHERE COALESCE(value_score,0) >= v_vs_p75*0.9 AND COALESCE(breakout_flag,false)
  ),
  -- ── TREND ──────────────────────────────────────────────────────────────
  s5 AS (
    SELECT player_id, v_snapshot_id, 'hot_form',
      LEAST(100, GREATEST(0, (form_score-50)*2))::numeric(5,2),
      CASE WHEN form_score>=80 THEN 'strong' WHEN form_score>=65 THEN 'moderate' ELSE 'weak' END,
      'positive',
      'Form score of ' || ROUND(form_score::numeric,0) || ' — riding a hot streak.',
      LEAST(0.85, GREATEST(0, 0.5+(form_score-65)/100.0))::numeric(4,3),
      jsonb_build_object('form_score',form_score)
    FROM base WHERE COALESCE(form_score,0) >= 65
  ),
  s6 AS (
    SELECT player_id, v_snapshot_id, 'cold_form',
      LEAST(100, GREATEST(0, (50-form_score)*2))::numeric(5,2),
      CASE WHEN form_score<=25 THEN 'strong' WHEN form_score<=35 THEN 'moderate' ELSE 'weak' END,
      'negative',
      'Form score of ' || ROUND(form_score::numeric,0) || ' — well below average.',
      LEAST(0.85, GREATEST(0, 0.5+(35-form_score)/80.0))::numeric(4,3),
      jsonb_build_object('form_score',form_score)
    FROM base WHERE COALESCE(form_score,100) <= 35
  ),
  s7 AS (
    SELECT player_id, v_snapshot_id, 'rising_projection',
      LEAST(100, GREATEST(0, 50 + COALESCE(recent_trend,0)*5))::numeric(5,2),
      CASE WHEN COALESCE(recent_trend,0)>=0.15 THEN 'strong' ELSE 'moderate' END,
      'positive',
      'Projection trending upward — recent games above average.',
      0.70::numeric(4,3),
      jsonb_build_object('recent_trend',recent_trend,'projection',ROUND(proj::numeric,1))
    FROM base WHERE COALESCE(recent_trend,0) >= 0.10 AND COALESCE(games_played,0) >= 1
  ),
  s8 AS (
    SELECT player_id, v_snapshot_id, 'falling_projection',
      LEAST(100, GREATEST(0, 50 + ABS(COALESCE(recent_trend,0))*5))::numeric(5,2),
      CASE WHEN COALESCE(recent_trend,0)<=-0.15 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'Projection declining — recent form below expectations.',
      0.70::numeric(4,3),
      jsonb_build_object('recent_trend',recent_trend,'projection',ROUND(proj::numeric,1))
    FROM base WHERE COALESCE(recent_trend,0) <= -0.10 AND COALESCE(games_played,0) >= 1
  ),
  -- ── RISK ───────────────────────────────────────────────────────────────
  s9 AS (
    SELECT player_id, v_snapshot_id, 'high_volatility',
      LEAST(100, GREATEST(0, 50 + (COALESCE(volatility_score,0)-v_vol_p75)*60))::numeric(5,2),
      CASE WHEN COALESCE(volatility_score,0)>=v_vol_p75*1.4 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'High score variance — ceiling of ' || ROUND(ceil_est::numeric,0) || ' but floor of ' || ROUND(floor_est::numeric,0) || '.',
      0.75::numeric(4,3),
      jsonb_build_object('volatility_score',volatility_score,'ceiling',ROUND(ceil_est::numeric,0),'floor',ROUND(floor_est::numeric,0))
    FROM base WHERE COALESCE(volatility_score,0) >= v_vol_p75
  ),
  s10 AS (
    SELECT player_id, v_snapshot_id, 'low_floor',
      LEAST(100, GREATEST(0, 50 + (v_floor_p20 - COALESCE(floor_est,0))*0.5))::numeric(5,2),
      CASE WHEN COALESCE(floor_est,0) <= v_floor_p20*0.7 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'Floor of ' || ROUND(floor_est::numeric,0) || ' pts is dangerously low. High bust risk.',
      0.70::numeric(4,3),
      jsonb_build_object('floor',ROUND(floor_est::numeric,0),'projection',ROUND(proj::numeric,1))
    FROM base WHERE COALESCE(floor_est,0) <= v_floor_p20 AND v_floor_p20 IS NOT NULL
  ),
  s11 AS (
    SELECT player_id, v_snapshot_id, 'role_instability',
      LEAST(100, GREATEST(0, 50 + (v_stab_p25 - COALESCE(stability_score,0.5))*80))::numeric(5,2),
      CASE WHEN COALESCE(stability_score,0.5) <= v_stab_p25*0.6 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'Role stability below average — output may be unreliable if role changes.',
      0.65::numeric(4,3),
      jsonb_build_object('stability_score',stability_score)
    FROM base WHERE COALESCE(stability_score,1.0) <= v_stab_p25
  ),
  -- ── MATCHUP ────────────────────────────────────────────────────────────
  s12 AS (
    SELECT player_id, v_snapshot_id, 'favorable_matchup',
      LEAST(100, GREATEST(0, 50 + (matchup_multiplier::numeric-1.0)*250))::numeric(5,2),
      CASE WHEN matchup_multiplier::numeric>=1.15 THEN 'strong' ELSE 'moderate' END,
      'positive',
      'Matchup multiplier ' || ROUND(matchup_multiplier::numeric,2) || 'x — opponent concedes above-average to this position.',
      0.72::numeric(4,3),
      jsonb_build_object('matchup_multiplier',matchup_multiplier,'matchup_label',matchup_label)
    FROM base WHERE COALESCE(matchup_multiplier::numeric,1.0) >= 1.10
  ),
  s13 AS (
    SELECT player_id, v_snapshot_id, 'difficult_matchup',
      LEAST(100, GREATEST(0, 50 + (1.0-matchup_multiplier::numeric)*250))::numeric(5,2),
      CASE WHEN matchup_multiplier::numeric<=0.88 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'Matchup multiplier ' || ROUND(matchup_multiplier::numeric,2) || 'x — opponent limits this position significantly.',
      0.72::numeric(4,3),
      jsonb_build_object('matchup_multiplier',matchup_multiplier,'matchup_label',matchup_label)
    FROM base WHERE COALESCE(matchup_multiplier::numeric,1.0) <= 0.90
  ),
  s14 AS (
    SELECT player_id, v_snapshot_id, 'positional_advantage',
      LEAST(100, GREATEST(0, 50 + (COALESCE(position_concession_multiplier,1.0)-1.0)*300))::numeric(5,2),
      'moderate', 'positive',
      'Venue and positional conditions favour this player''s scoring profile.',
      0.65::numeric(4,3),
      jsonb_build_object('position_concession_multiplier',position_concession_multiplier,'position',position)
    FROM base WHERE COALESCE(position_concession_multiplier,1.0) >= 1.08
  ),
  -- ── CONSISTENCY ────────────────────────────────────────────────────────
  s15 AS (
    SELECT player_id, v_snapshot_id, 'high_consistency',
      LEAST(100, GREATEST(0, 50 + (consistency-v_cons_p75)*100))::numeric(5,2),
      CASE WHEN consistency>=v_cons_p75*1.1 THEN 'strong' ELSE 'moderate' END,
      'positive',
      'Consistency score of ' || ROUND(consistency::numeric,2) || ' — reliably delivers near-projection.',
      LEAST(0.85, GREATEST(0, 0.55+consistency*0.3))::numeric(4,3),
      jsonb_build_object('consistency',consistency)
    FROM base WHERE COALESCE(consistency,0) >= v_cons_p75 AND v_cons_p75 IS NOT NULL
  ),
  s16 AS (
    SELECT player_id, v_snapshot_id, 'low_consistency',
      LEAST(100, GREATEST(0, 50 + (v_cons_p25-consistency)*100))::numeric(5,2),
      CASE WHEN consistency<=v_cons_p25*0.7 THEN 'strong' ELSE 'moderate' END,
      'negative',
      'Consistency score of ' || ROUND(consistency::numeric,2) || ' — high game-to-game variance.',
      0.65::numeric(4,3),
      jsonb_build_object('consistency',consistency)
    FROM base WHERE COALESCE(consistency,1) <= v_cons_p25 AND v_cons_p25 IS NOT NULL
  ),
  s17 AS (
    SELECT player_id, v_snapshot_id, 'ceiling_heavy',
      LEAST(100, GREATEST(0, 50 + (COALESCE(upside_pct,0)-25)*1.5))::numeric(5,2),
      CASE WHEN COALESCE(upside_pct,0)>=40 THEN 'strong' ELSE 'moderate' END,
      'positive',
      'Ceiling of ' || ROUND(ceil_est::numeric,0) || ' pts (' || ROUND(COALESCE(upside_pct,0)::numeric,0) || '% above projection). Strong POD/captain option.',
      0.68::numeric(4,3),
      jsonb_build_object('ceiling',ROUND(ceil_est::numeric,0),'projection',ROUND(proj::numeric,1),'upside_pct',upside_pct)
    FROM base WHERE COALESCE(upside_pct,0) >= 25 AND ceil_est > 0
  ),
  s18 AS (
    SELECT player_id, v_snapshot_id, 'floor_heavy',
      LEAST(100, GREATEST(0,
        50 + CASE WHEN proj > 0 THEN (floor_est::numeric / NULLIF(proj::numeric,0) - 0.75) * 200 ELSE 0 END
      ))::numeric(5,2),
      'moderate', 'positive',
      'Floor of ' || ROUND(floor_est::numeric,0) || ' pts is close to projection — minimal bust risk.',
      0.72::numeric(4,3),
      jsonb_build_object('floor',ROUND(floor_est::numeric,0),'projection',ROUND(proj::numeric,1))
    FROM base WHERE proj > 0 AND (floor_est::numeric / NULLIF(proj::numeric,0)) >= 0.85
  ),
  -- ── OPPORTUNITY ────────────────────────────────────────────────────────
  s19 AS (
    SELECT player_id, v_snapshot_id, 'breakout_candidate',
      LEAST(100, GREATEST(0, 50 + COALESCE(breakout_probability,0)*60))::numeric(5,2),
      CASE WHEN COALESCE(breakout_probability,0)>=0.55 THEN 'strong'
           WHEN COALESCE(breakout_probability,0)>=0.40 THEN 'moderate' ELSE 'weak' END,
      'positive',
      'Breakout probability of ' || ROUND(COALESCE(breakout_probability,0)::numeric*100,0) || '% — model detects above-average output conditions.',
      LEAST(0.85, GREATEST(0, 0.5+COALESCE(breakout_probability,0)*0.5))::numeric(4,3),
      jsonb_build_object('breakout_probability',breakout_probability,'breakout_index',breakout_index,'ceiling_hit_rate',ceiling_hit_rate)
    FROM base WHERE COALESCE(breakout_probability,0) >= 0.35
  ),
  s20 AS (
    SELECT player_id, v_snapshot_id, 'bounce_back',
      LEAST(100, GREATEST(0, 50 + (consistency-0.5)*60 + (50-form_score)*0.5))::numeric(5,2),
      'moderate', 'positive',
      'Consistent performer in poor recent form — historical pattern suggests strong bounce-back.',
      0.68::numeric(4,3),
      jsonb_build_object('consistency',consistency,'form_score',form_score)
    FROM base WHERE COALESCE(form_score,100) < 45 AND COALESCE(consistency,0) >= 0.55
  ),
  s21 AS (
    SELECT player_id, v_snapshot_id, 'regression_candidate',
      LEAST(100, GREATEST(0, 50 + (form_score-70)*0.8 + (0.5-consistency)*60))::numeric(5,2),
      'moderate', 'negative',
      'Running hot (form ' || ROUND(form_score::numeric,0) || ') with low consistency — regression risk.',
      0.65::numeric(4,3),
      jsonb_build_object('form_score',form_score,'consistency',consistency)
    FROM base WHERE COALESCE(form_score,0) > 72 AND COALESCE(consistency,1) < 0.50
  ),
  -- ── AI SIGNALS ─────────────────────────────────────────────────────────
  s22 AS (
    SELECT player_id, v_snapshot_id, 'ai_strong_buy',
      LEAST(100, GREATEST(0, 70 + COALESCE(projection_confidence,0)*0.25))::numeric(5,2),
      CASE WHEN recommendation_strength='strong' THEN 'strong' ELSE 'moderate' END,
      'positive',
      COALESCE(recommendation_short, 'AI model rates this a strong buy this round.'),
      LEAST(0.90, GREATEST(0, 0.65+COALESCE(projection_confidence,0)/400.0))::numeric(4,3),
      jsonb_build_object('recommendation_color',recommendation_color,'confidence_label',confidence_label)
    FROM base
    WHERE LOWER(COALESCE(recommendation_color,'')) IN ('green','emerald','lime')
      AND COALESCE(projection_confidence,0) >= 68
  ),
  s23 AS (
    SELECT player_id, v_snapshot_id, 'ai_avoid',
      LEAST(100, GREATEST(0, 65 + COALESCE(projection_confidence,0)*0.20))::numeric(5,2),
      CASE WHEN recommendation_strength='strong' THEN 'strong' ELSE 'moderate' END,
      'negative',
      COALESCE(recommendation_short, 'AI model flags this player as avoid.'),
      LEAST(0.88, GREATEST(0, 0.60+COALESCE(projection_confidence,0)/400.0))::numeric(4,3),
      jsonb_build_object('recommendation_color',recommendation_color,'confidence_label',confidence_label)
    FROM base
    WHERE LOWER(COALESCE(recommendation_color,'')) IN ('red','orange','rose')
      AND COALESCE(projection_confidence,0) >= 65
  ),
  s24 AS (
    SELECT player_id, v_snapshot_id, 'ai_high_confidence',
      LEAST(100, GREATEST(0, COALESCE(projection_confidence,0)))::numeric(5,2),
      CASE WHEN confidence_label='Elite' THEN 'strong'
           WHEN confidence_label='Strong' THEN 'moderate' ELSE 'weak' END,
      'positive',
      'Projection confidence: ' || COALESCE(confidence_label,'?') || ' (' || ROUND(COALESCE(projection_confidence,0)::numeric,0) || '/100).',
      LEAST(0.92, GREATEST(0, COALESCE(projection_confidence,0)/100.0))::numeric(4,3),
      jsonb_build_object('projection_confidence',projection_confidence,'confidence_label',confidence_label)
    FROM base WHERE COALESCE(projection_confidence,0) >= 75
  ),
  -- ── UNION ──────────────────────────────────────────────────────────────
  all_sig AS (
    SELECT player_id, sid, t, sc, ss, sd, ex, cn, md FROM s1
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s2
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s3
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s4
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s5
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s6
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s7
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s8
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s9
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s10
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s11
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s12
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s13
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s14
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s15
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s16
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s17
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s18
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s19
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s20
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s21
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s22
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s23
    UNION ALL SELECT player_id, v_snapshot_id, t, sc, ss, sd, ex, cn, md FROM s24
  ),
  ins AS (
    INSERT INTO afl.player_signals
      (player_id, snapshot_id, signal_type, signal_score, signal_strength,
       signal_direction, explanation, confidence, metadata)
    SELECT player_id, sid, t, sc, ss, sd, ex, cn, md
    FROM all_sig WHERE player_id IS NOT NULL
    ON CONFLICT (player_id, signal_type,
      COALESCE(snapshot_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      signal_score=EXCLUDED.signal_score, signal_strength=EXCLUDED.signal_strength,
      signal_direction=EXCLUDED.signal_direction, explanation=EXCLUDED.explanation,
      confidence=EXCLUDED.confidence, metadata=EXCLUDED.metadata, created_at=now()
    RETURNING player_id
  )
  SELECT COUNT(*) INTO v_signals_written FROM ins;

  SELECT COUNT(DISTINCT player_id) INTO v_players_processed
  FROM afl.player_signals WHERE snapshot_id IS NOT DISTINCT FROM v_snapshot_id;

  RETURN jsonb_build_object(
    'ok', true, 'signals_written', v_signals_written,
    'players_processed', v_players_processed, 'snapshot_id', v_snapshot_id,
    'signal_types', 24, 'generated_at', NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'hint', SQLSTATE);
END;
$$;

-- Run it now
SELECT afl.fn_generate_player_signals(NULL);
