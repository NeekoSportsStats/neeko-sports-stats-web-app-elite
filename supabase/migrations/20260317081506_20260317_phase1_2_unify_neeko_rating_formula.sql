/*
  # Phase 1 + 2 + 5 + 6 + 7 — Calibration & Formula Rebalance

  ## Changes
  1. Add neeko_rating_raw + neeko_rating_scaled to player_rankings_cache
     - raw = old neeko_rating
     - scaled = (raw / max_raw) * 100 clamped 0-100
  2. Confidence/risk alignment clamp
  3. Value tier percentile calibration (top 10/20/30 split)
  4. Reduce projection dominance (0.45 vs 0.50)
  5. Best value formula updated (proj*0.45 + value*10*0.35 + conf*0.20)
  6. Rebuild populate_rankings_cache_from_source with all fixes
  7. Fix v_rankings_free to expose price, value_score, projection_final (Phase 9)
*/

-- Step 1: Add scaled rating columns if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='afl' AND table_name='player_rankings_cache' AND column_name='neeko_rating_raw') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN neeko_rating_raw double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='afl' AND table_name='player_rankings_cache' AND column_name='neeko_rating_scaled') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN neeko_rating_scaled double precision;
  END IF;
END $$;

-- Step 2: Rebuild populate function with all calibration fixes
DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_max_neeko numeric;
  -- value_score percentile thresholds (top 10%, top 30%, top 60%)
  v_val_p10 numeric;
  v_val_p30 numeric;
  v_val_p60 numeric;
BEGIN
  -- Compute neeko_rating max from MV for scaling
  SELECT GREATEST(MAX(neeko_rating), 1.0) INTO v_max_neeko FROM afl.mv_player_rankings;

  -- Compute value_score percentile thresholds from non-zero priced players
  SELECT
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY fp.value_score)
  INTO v_val_p10, v_val_p30, v_val_p60
  FROM afl.mv_player_rankings fp
  WHERE fp.value_score IS NOT NULL AND fp.price > 0;

  -- Safety fallbacks
  v_val_p10 := COALESCE(v_val_p10, 5.5);
  v_val_p30 := COALESCE(v_val_p30, 3.5);
  v_val_p60 := COALESCE(v_val_p60, 2.0);

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, neeko_rating_raw, neeko_rating_scaled,
    best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, captain_score, captain_rating,
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
    nr.position_group,
    nr.position_group,
    nr.projection::numeric                                          AS projection_final,
    nr.projection::double precision                                 AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    -- neeko_rating: keep original value for backward compat
    nr.neeko_rating::double precision                               AS neeko_rating,
    -- neeko_rating_raw: original unscaled value
    nr.neeko_rating::double precision                               AS neeko_rating_raw,
    -- neeko_rating_scaled: rescaled to 0-100 based on max in dataset
    LEAST(100.0, ROUND((nr.neeko_rating::numeric / v_max_neeko) * 100.0, 1))::double precision AS neeko_rating_scaled,

    -- Phase 7: best_value_score formula (projection*0.45 + value_score_scaled*0.35 + confidence*0.20)
    round((
      nr.projection::numeric                              * 0.45
      + COALESCE(nr.value_score, 0.0)::numeric * 10.0    * 0.35
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                         AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    -- Phase 5: percentile-based value tiers
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

    -- Phase 2: confidence clamped, then risk aligned
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision  AS projection_confidence,

    -- Phase 2: risk aligned with confidence
    CASE
      WHEN COALESCE(nr.confidence, 50) >= 70
        THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
      WHEN COALESCE(nr.confidence, 50) <= 45
        THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
      ELSE COALESCE(nr.volatility_score, 50.0)
    END::double precision                                           AS risk_rating,

    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                              AS matchup_rating,
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                              AS matchup_label,
    COALESCE(nr.matchup_multiplier::numeric, 1.0)                   AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,

    -- captain_score inline
    LEAST(100, GREATEST(0,
      nr.projection::numeric * 0.55
      + COALESCE(nr.confidence, 50.0) * 0.25
      + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
    ))::double precision                                             AS captain_score,

    CASE
      WHEN LEAST(100, GREATEST(0,
        nr.projection::numeric * 0.55
        + COALESCE(nr.confidence, 50.0) * 0.25
        + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
      )) >= 85 THEN 'Elite Captain'
      WHEN LEAST(100, GREATEST(0,
        nr.projection::numeric * 0.55
        + COALESCE(nr.confidence, 50.0) * 0.25
        + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
      )) >= 70 THEN 'Strong Captain'
      WHEN LEAST(100, GREATEST(0,
        nr.projection::numeric * 0.55
        + COALESCE(nr.confidence, 50.0) * 0.25
        + (1.0 - COALESCE(nr.volatility_score, 50.0) / 100.0) * 20.0
      )) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                              AS captain_rating,

    COALESCE(nr.games_played, 0)::integer                           AS games_played,

    -- BUY/HOLD/SELL using percentile-calibrated thresholds
    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
      THEN 'HOLD'
      ELSE 'SELL'
    END                                                              AS ai_recommendation,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'green'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
      THEN 'grey'
      ELSE 'red'
    END                                                              AS recommendation_color,

    aia.summary_short                                                AS recommendation_short,
    aia.summary_long                                                 AS recommendation_why,
    aia.summary_long                                                 AS ai_summary,
    aia.generated_at                                                 AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END AS consistency_tier,
    0,
    now(),
    now()

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

END;
$$;

-- Step 3: Repopulate cache with all fixes
SELECT afl.populate_rankings_cache_from_source();
