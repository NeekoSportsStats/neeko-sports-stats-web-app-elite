/*
  # Recalibrate BUY/HOLD/SELL thresholds to data-driven percentiles

  ## Summary
  The fixed threshold of value_score >= 5.5 was too high for this dataset
  (p95 = 4.42, p90 = 3.68). Replacing with percentile-driven thresholds
  that target ~10-20 BUY signals out of 687 players (~1.5-3%).

  ### Changes
  - BUY: value_score >= p90 AND confidence >= 60 AND risk <= 40
  - SELL: value_score <= p50 OR risk >= 65
  - HOLD: everything else
  - Recommendation color updated to match: green/red/grey
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, pg_temp
AS $$
DECLARE
  v_min_neeko  numeric;
  v_max_neeko  numeric;
  v_val_p10    numeric;
  v_val_p30    numeric;
  v_val_p60    numeric;
  v_val_p90    numeric;
  v_val_p50    numeric;
  v_cap_min    numeric;
  v_cap_max    numeric;
BEGIN

  -- Phase 1: True min-max for neeko_rating_scaled
  SELECT
    COALESCE(MIN(
      round(
          nr2.projection * 0.40
        + COALESCE(nr2.confidence, 50.0) * 0.20
        + COALESCE(nr2.consistency, 50.0) * 0.15
        + COALESCE(nr2.value_score, 50.0) * 0.20
        - COALESCE(nr2.volatility_score, 50.0) * 0.05
      , 1)
    ), 0),
    GREATEST(MAX(
      round(
          nr2.projection * 0.40
        + COALESCE(nr2.confidence, 50.0) * 0.20
        + COALESCE(nr2.consistency, 50.0) * 0.15
        + COALESCE(nr2.value_score, 50.0) * 0.20
        - COALESCE(nr2.volatility_score, 50.0) * 0.05
      , 1)
    ), 1.0)
  INTO v_min_neeko, v_max_neeko
  FROM afl.mv_player_rankings nr2;

  -- Value percentile thresholds (all players with value_score > 0)
  SELECT
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY fp.value_score)
  INTO v_val_p10, v_val_p30, v_val_p60, v_val_p90, v_val_p50
  FROM afl.mv_player_rankings fp
  WHERE fp.value_score > 0;

  v_val_p10  := COALESCE(v_val_p10,  4.5);
  v_val_p30  := COALESCE(v_val_p30,  3.3);
  v_val_p60  := COALESCE(v_val_p60,  1.7);
  v_val_p90  := COALESCE(v_val_p90,  3.5);
  v_val_p50  := COALESCE(v_val_p50,  1.0);

  -- Captain score raw range for min-max normalization
  SELECT
    COALESCE(MIN(
        nr.ceiling * 0.40
      + nr.projection * 0.25
      + COALESCE(nr.consistency, 50.0) * 0.15
      + COALESCE(nr.confidence, 50.0) * 0.10
      + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
      - COALESCE(nr.volatility_score, 50.0) * 0.05
    ), 0),
    COALESCE(NULLIF(MAX(
        nr.ceiling * 0.40
      + nr.projection * 0.25
      + COALESCE(nr.consistency, 50.0) * 0.15
      + COALESCE(nr.confidence, 50.0) * 0.10
      + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
      - COALESCE(nr.volatility_score, 50.0) * 0.05
    ), 0), 1)
  INTO v_cap_min, v_cap_max
  FROM afl.mv_player_rankings nr;

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
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    nr."position",
    nr."position",

    nr.projection::numeric                                              AS projection_final,
    nr.projection::double precision                                     AS projection,
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
    , 1)::double precision                                              AS neeko_rating,

    round(
        nr.projection::numeric * 0.40
      + COALESCE(nr.confidence, 50.0)::numeric * 0.20
      + COALESCE(nr.consistency, 50.0)::numeric * 0.15
      + COALESCE(nr.value_score, 50.0)::numeric * 0.20
      - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
    , 1)::double precision                                              AS neeko_rating_raw,

    -- Phase 1: True min-max scaling
    LEAST(100.0, GREATEST(0.0, ROUND(
      100.0 * (
        round(
            nr.projection::numeric * 0.40
          + COALESCE(nr.confidence, 50.0)::numeric * 0.20
          + COALESCE(nr.consistency, 50.0)::numeric * 0.15
          + COALESCE(nr.value_score, 50.0)::numeric * 0.20
          - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
        , 1) - v_min_neeko
      ) / NULLIF(v_max_neeko - v_min_neeko, 0)
    , 1)))::double precision                                            AS neeko_rating_scaled,

    round((
        nr.projection::numeric                            * 0.45
      + COALESCE(nr.value_score, 0.0)::numeric * 10.0   * 0.35
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                             AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    -- Phase 3: Value tags for ALL players with value_score > 0
    CASE
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                 AS value_tag,

    CASE
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                 AS value_tier,

    -- Phase 5: Confidence aligned, risk clamped
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision  AS projection_confidence,

    CASE
      WHEN COALESCE(nr.confidence, 50) >= 70
        THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
      WHEN COALESCE(nr.confidence, 50) <= 45
        THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
      ELSE COALESCE(nr.volatility_score, 50.0)
    END::double precision                                               AS risk_rating,

    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                 AS matchup_rating,
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                 AS matchup_label,
    COALESCE(nr.matchup_multiplier::numeric, 1.0)                      AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision  AS upside_rating,

    CASE
      WHEN nr.projection > 0
        THEN ROUND(((nr.ceiling::numeric - nr.projection::numeric) / NULLIF(nr.projection::numeric, 0)) * 100.0, 1)
      ELSE NULL
    END::double precision                                               AS upside_pct,

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
    ))::double precision                                                AS captain_score,

    CASE
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(100.0 * ((nr.ceiling::numeric*0.40 + nr.projection::numeric*0.25 + COALESCE(nr.consistency,50.0)::numeric*0.15 + COALESCE(nr.confidence,50.0)::numeric*0.10 + COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05 - COALESCE(nr.volatility_score,50.0)::numeric*0.05) - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
      )) >= 80 THEN 'Elite Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(100.0 * ((nr.ceiling::numeric*0.40 + nr.projection::numeric*0.25 + COALESCE(nr.consistency,50.0)::numeric*0.15 + COALESCE(nr.confidence,50.0)::numeric*0.10 + COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05 - COALESCE(nr.volatility_score,50.0)::numeric*0.05) - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
      )) >= 60 THEN 'Strong Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(100.0 * ((nr.ceiling::numeric*0.40 + nr.projection::numeric*0.25 + COALESCE(nr.consistency,50.0)::numeric*0.15 + COALESCE(nr.confidence,50.0)::numeric*0.10 + COALESCE(nr.matchup_multiplier::numeric,1.0)*10.0*0.05 - COALESCE(nr.volatility_score,50.0)::numeric*0.05) - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
      )) >= 40 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                                 AS captain_rating,

    COALESCE(nr.games_played, 0)::integer                              AS games_played,

    -- Phase 4: Data-driven BUY/HOLD/SELL (~10-20 BUY out of 687)
    CASE
      WHEN nr.value_score >= v_val_p90
        AND COALESCE(nr.confidence, 50) >= 60
        AND CASE
              WHEN COALESCE(nr.confidence, 50) >= 70 THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
              WHEN COALESCE(nr.confidence, 50) <= 45 THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
              ELSE COALESCE(nr.volatility_score, 50.0)
            END <= 40.0
        THEN 'BUY'
      WHEN nr.value_score <= v_val_p50
        OR CASE
             WHEN COALESCE(nr.confidence, 50) >= 70 THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
             WHEN COALESCE(nr.confidence, 50) <= 45 THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
             ELSE COALESCE(nr.volatility_score, 50.0)
           END >= 65.0
        THEN 'SELL'
      ELSE 'HOLD'
    END                                                                 AS ai_recommendation,

    CASE
      WHEN nr.value_score >= v_val_p90
        AND COALESCE(nr.confidence, 50) >= 60
        AND CASE
              WHEN COALESCE(nr.confidence, 50) >= 70 THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
              WHEN COALESCE(nr.confidence, 50) <= 45 THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
              ELSE COALESCE(nr.volatility_score, 50.0)
            END <= 40.0
        THEN 'green'
      WHEN nr.value_score <= v_val_p50
        OR CASE
             WHEN COALESCE(nr.confidence, 50) >= 70 THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
             WHEN COALESCE(nr.confidence, 50) <= 45 THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
             ELSE COALESCE(nr.volatility_score, 50.0)
           END >= 65.0
        THEN 'red'
      ELSE 'grey'
    END                                                                 AS recommendation_color,

    aia.summary_short                                                   AS recommendation_short,
    aia.summary_long                                                    AS recommendation_why,
    aia.summary_long                                                    AS ai_summary,
    aia.generated_at                                                    AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                 AS consistency_tier,
    0,
    now(),
    now()

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

END;
$$;

-- Re-populate with recalibrated thresholds
SELECT afl.populate_rankings_cache_from_source();
