/*
  # NEEKO SPORTS — FULL SYSTEM UNIFICATION: Step 2
  Rebuild populate_rankings_cache_from_source() with all derived decision fields

  ## Summary
  Extends the populate function to compute and store start_sit_decision, edge_score,
  edge_tier, market_watch_category, and recommendation_strength in the cache.

  These are now the AUTHORITATIVE values for all downstream pages.
  No frontend should recompute these independently.

  ## Changes
  - populate_rankings_cache_from_source(): adds 5 new derived columns to INSERT
  - Edge score formula: proj*0.40 + value*0.25 + conf*0.20 + (1-risk)*0.15
  - start_sit_decision: BUY+conf>=60→START, SELL→SIT, else CONSIDER
  - market_watch_category: derived from recommendation + value_score + risk + form
  - recommendation_strength: STRONG / MODERATE / WEAK
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, pg_temp
AS $$
DECLARE
  v_max_neeko  numeric;
  v_val_p10    numeric;
  v_val_p30    numeric;
  v_val_p60    numeric;
  v_cap_min    numeric;
  v_cap_max    numeric;
BEGIN

  SELECT GREATEST(MAX(
    round(
        pp2.projection_final * 0.40
      + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp2.projection_confidence, 50.0) * 0.20
      + COALESCE(pp2.consistency_score, 50.0) * 0.15
      + COALESCE(fp.value_score, 50.0) * 0.20
      - COALESCE(pp2.volatility_score, 50.0) * 0.05
    , 1)
  ), 1.0)
  INTO v_max_neeko
  FROM afl.player_projection pp2
  LEFT JOIN afl.feature_price fp ON fp.player_id = pp2.player_id
  LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp2.player_id
  LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp2.player_id;

  SELECT
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY fp.value_score)
  INTO v_val_p10, v_val_p30, v_val_p60
  FROM afl.mv_player_rankings fp
  WHERE fp.value_score > 0 AND COALESCE(fp.price, 0) > 0;

  v_val_p10 := COALESCE(v_val_p10, 4.5);
  v_val_p30 := COALESCE(v_val_p30, 3.3);
  v_val_p60 := COALESCE(v_val_p60, 1.7);

  SELECT
    COALESCE(MIN(
        nr2.ceiling * 0.40
      + nr2.projection * 0.25
      + COALESCE(nr2.consistency, 50.0) * 0.15
      + COALESCE(nr2.confidence, 50.0) * 0.10
      + COALESCE(nr2.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
      - COALESCE(nr2.volatility_score, 50.0) * 0.05
    ), 0),
    COALESCE(NULLIF(MAX(
        nr2.ceiling * 0.40
      + nr2.projection * 0.25
      + COALESCE(nr2.consistency, 50.0) * 0.15
      + COALESCE(nr2.confidence, 50.0) * 0.10
      + COALESCE(nr2.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
      - COALESCE(nr2.volatility_score, 50.0) * 0.05
    ), 0), 1)
  INTO v_cap_min, v_cap_max
  FROM afl.mv_player_rankings nr2;

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, neeko_rating_raw, neeko_rating_scaled,
    best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, upside_pct, captain_score, captain_rating,
    games_played,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    recommendation_strength,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at,
    start_sit_decision, edge_score, edge_tier, market_watch_category
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    nr."position",
    nr."position",

    nr.projection::numeric                                            AS projection_final,
    nr.projection::double precision                                   AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    round(
        nr.projection::numeric * 0.40
      + COALESCE(nr.confidence, 50.0)::numeric * 0.20
      + COALESCE(nr.consistency, 50.0)::numeric * 0.15
      + COALESCE(nr.value_score, 50.0)::numeric * 0.20
      - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
    , 1)::double precision                                            AS neeko_rating,

    round(
        nr.projection::numeric * 0.40
      + COALESCE(nr.confidence, 50.0)::numeric * 0.20
      + COALESCE(nr.consistency, 50.0)::numeric * 0.15
      + COALESCE(nr.value_score, 50.0)::numeric * 0.20
      - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
    , 1)::double precision                                            AS neeko_rating_raw,

    LEAST(100.0, ROUND((
      round(
          nr.projection::numeric * 0.40
        + COALESCE(nr.confidence, 50.0)::numeric * 0.20
        + COALESCE(nr.consistency, 50.0)::numeric * 0.15
        + COALESCE(nr.value_score, 50.0)::numeric * 0.20
        - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
      , 1) / v_max_neeko
    ) * 100.0, 1))::double precision                                  AS neeko_rating_scaled,

    round((
        nr.projection::numeric                            * 0.45
      + COALESCE(nr.value_score, 0.0)::numeric * 10.0   * 0.35
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                            AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                AS value_tag,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                AS value_tier,

    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision AS projection_confidence,

    CASE
      WHEN COALESCE(nr.confidence, 50) >= 70
        THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
      WHEN COALESCE(nr.confidence, 50) <= 45
        THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
      ELSE COALESCE(nr.volatility_score, 50.0)
    END::double precision                                              AS risk_rating,

    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                AS matchup_rating,
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                AS matchup_label,
    COALESCE(nr.matchup_multiplier::numeric, 1.0)                     AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    COALESCE(nr.breakout_probability * 100.0, 0)::double precision    AS upside_pct,

    -- Captain score normalized 0–100
    LEAST(100.0, GREATEST(0.0,
      ROUND(
        100.0 * (
          (
              nr.ceiling::numeric * 0.40
            + nr.projection::numeric * 0.25
            + COALESCE(nr.consistency, 50.0)::numeric * 0.15
            + COALESCE(nr.confidence, 50.0)::numeric * 0.10
            + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
            - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
          ) - v_cap_min
        ) / NULLIF(v_cap_max - v_cap_min, 0)
      , 1)
    ))::double precision                                               AS captain_score,

    CASE
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(
          100.0 * (
            (
                nr.ceiling::numeric * 0.40
              + nr.projection::numeric * 0.25
              + COALESCE(nr.consistency, 50.0)::numeric * 0.15
              + COALESCE(nr.confidence, 50.0)::numeric * 0.10
              + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
              - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
            ) - v_cap_min
          ) / NULLIF(v_cap_max - v_cap_min, 0)
        , 1)
      )) >= 80 THEN 'Elite Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(
          100.0 * (
            (
                nr.ceiling::numeric * 0.40
              + nr.projection::numeric * 0.25
              + COALESCE(nr.consistency, 50.0)::numeric * 0.15
              + COALESCE(nr.confidence, 50.0)::numeric * 0.10
              + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
              - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
            ) - v_cap_min
          ) / NULLIF(v_cap_max - v_cap_min, 0)
        , 1)
      )) >= 60 THEN 'Strong Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(
          100.0 * (
            (
                nr.ceiling::numeric * 0.40
              + nr.projection::numeric * 0.25
              + COALESCE(nr.consistency, 50.0)::numeric * 0.15
              + COALESCE(nr.confidence, 50.0)::numeric * 0.10
              + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
              - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
            ) - v_cap_min
          ) / NULLIF(v_cap_max - v_cap_min, 0)
        , 1)
      )) >= 40 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                                AS captain_rating,

    COALESCE(nr.games_played, 0)::integer                             AS games_played,

    -- ai_recommendation: SQL-only BUY / HOLD / SELL
    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
        THEN 'HOLD'
      ELSE 'SELL'
    END                                                                AS ai_recommendation,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        THEN 'green'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
        THEN 'grey'
      ELSE 'red'
    END                                                                AS recommendation_color,

    aia.summary_short                                                  AS recommendation_short,
    aia.summary_long                                                   AS recommendation_why,

    -- recommendation_strength
    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        AND COALESCE(nr.confidence, 50) >= 70
        THEN 'STRONG'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        THEN 'MODERATE'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
        THEN 'MODERATE'
      ELSE 'WEAK'
    END                                                                AS recommendation_strength,

    aia.summary_long                                                   AS ai_summary,
    aia.generated_at                                                   AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                AS consistency_tier,
    0,
    now(),
    now(),

    -- ─── DERIVED DECISION FIELDS ─────────────────────────────────────────────

    -- start_sit_decision
    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        AND COALESCE(nr.confidence, 50) >= 60
        THEN 'START'
      WHEN NOT (COALESCE(nr.value_score, 0) >= v_val_p60 AND nr.projection::numeric >= 70)
        THEN 'SIT'
      ELSE 'CONSIDER'
    END                                                                AS start_sit_decision,

    -- edge_score (0–100)
    CASE
      WHEN (
        CASE WHEN nr.projection IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nr.confidence IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nr.volatility_score IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nr.value_score IS NULL THEN 1 ELSE 0 END
      ) >= 2 THEN NULL
      ELSE LEAST(100, GREATEST(0, ROUND((
          LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
          LEAST(GREATEST((COALESCE(nr.value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
          LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
          LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
        ) * 100
      )::integer))
    END                                                                AS edge_score,

    -- edge_tier
    CASE
      WHEN (
        CASE WHEN nr.projection IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nr.confidence IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nr.volatility_score IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nr.value_score IS NULL THEN 1 ELSE 0 END
      ) >= 2 THEN NULL
      WHEN LEAST(100, GREATEST(0, ROUND((
          LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
          LEAST(GREATEST((COALESCE(nr.value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
          LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
          LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
        ) * 100
      )::integer)) >= 90 THEN 'Elite Edge'
      WHEN LEAST(100, GREATEST(0, ROUND((
          LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
          LEAST(GREATEST((COALESCE(nr.value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
          LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
          LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
        ) * 100
      )::integer)) >= 75 THEN 'Strong Edge'
      WHEN LEAST(100, GREATEST(0, ROUND((
          LEAST(GREATEST((nr.projection::numeric - 60.0) / 60.0, 0), 1) * 0.40 +
          LEAST(GREATEST((COALESCE(nr.value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
          LEAST(GREATEST(COALESCE(nr.confidence, 50) / 100.0, 0), 1) * 0.20 +
          LEAST(GREATEST(1.0 - COALESCE(nr.volatility_score, 50) / 100.0, 0), 1) * 0.15
        ) * 100
      )::integer)) >= 60 THEN 'Playable Edge'
      ELSE 'Monitor'
    END                                                                AS edge_tier,

    -- market_watch_category
    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        AND COALESCE(nr.games_played, 99) <= 3
        THEN 'CASH COW'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        THEN 'BUY TARGET'
      WHEN NOT (COALESCE(nr.value_score, 0) >= v_val_p60 AND nr.projection::numeric >= 70)
        AND COALESCE(nr.volatility_score, 50.0) >= 60.0
        THEN 'TRAP'
      WHEN NOT (COALESCE(nr.value_score, 0) >= v_val_p60 AND nr.projection::numeric >= 70)
        THEN 'SELL'
      WHEN COALESCE(nr.form_score, 0) >= 70
        AND nr.projection::numeric >= 85
        THEN 'TRENDING UP'
      ELSE NULL
    END                                                                AS market_watch_category

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

END;
$$;
