/*
  # Fix populate_rankings_cache_from_source

  ## Changes

  ### 1. Deterministic ai_recommendation
  - Removed dependency on ai.player_ai_analysis for BUY/SELL/HOLD decision
  - Recommendation now computed from value_score + projection + risk (volatility_score)
  - OVERPRICED players forced to SELL
  - HIGH volatility (>= 70) forced to SELL
  - Logic: BUY when value >= 115 + projection >= 100 + risk <= 40
  - Logic: HOLD when value >= 100 + projection >= 90 (or catch-all)
  - Logic: SELL when value < 90 or high risk
  - AI still supplies summary_short (recommendation_why) and summary_long (ai_summary)

  ### 2. matchup_rating label mapping
  - mv_player_rankings.matchup_rating is a numeric multiplier (range ~1.005–1.020)
  - Now mapped to human label: ELITE / FAVOURABLE / NEUTRAL / TOUGH
  - Threshold: >= 1.015 = ELITE, >= 1.010 = FAVOURABLE, >= 1.005 = NEUTRAL, else TOUGH

  ### 3. risk_rating numeric (0–100 scale) 
  - Cache stores risk_rating as double precision
  - Source: volatility_score from mv_player_rankings (direct, no extra join needed)
  - This ensures trap alerts (>= 70) work correctly

  ### 4. projection_confidence from mv_player_rankings.confidence (already correct)

  ### 5. value_tag / value_tier consistency
  - Added validation: OVERPRICED players cannot be BUY
  - HIGH RISK (volatility >= 70) cannot be BUY

  ### 6. recommendation_color updated to reflect deterministic recommendation

  ### Security
  - No RLS changes
  - Function is SECURITY DEFINER (unchanged)
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
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
    nr.projection::numeric                                                      AS projection_final,
    nr.projection::double precision                                             AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    -- neeko_rating: projection 55% | confidence 23% | consistency 17% | value 5%
    round((
      (nr.projection::numeric                                            * 0.55) +
      (COALESCE(nr.confidence, 50.0)::numeric                           * 0.23) +
      (COALESCE(nr.consistency, 50.0)::numeric                          * 0.17) +
      (LEAST(COALESCE(nr.value_score, 50.0)::numeric, 130.0::numeric)   * 0.05)
    ) * CASE
      WHEN COALESCE(nr.games_played, 0) < 3  THEN 0.72::numeric
      WHEN COALESCE(nr.games_played, 0) < 6  THEN 0.85::numeric
      WHEN COALESCE(nr.games_played, 0) < 11 THEN 0.94::numeric
      ELSE 1.00::numeric
    END, 1)::double precision                                                   AS neeko_rating,

    -- best_value_score: projection 30% | confidence 15% | value 55%
    round((
      nr.projection::numeric                                * 0.30 +
      COALESCE(nr.confidence, 50.0)::numeric                * 0.15 +
      COALESCE(nr.value_score, 50.0)::numeric               * 0.55
    ), 1)::double precision                                                     AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    -- value_tag
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,

    -- value_tier (same as value_tag)
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

    -- projection_confidence (0–100 scale)
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision      AS projection_confidence,

    -- risk_rating: use volatility_score directly from mv_player_rankings (0–100 scale)
    COALESCE(nr.volatility_score, 50.0)::double precision                       AS risk_rating,

    -- matchup_rating: map numeric multiplier to human label
    CASE
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.015 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.010 THEN 'FAVOURABLE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.005 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                         AS matchup_rating,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100, COALESCE(cap.captain_score, 0)))::double precision   AS captain_score,
    CASE
      WHEN COALESCE(cap.captain_score, 0) >= 85 THEN 'Elite Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 70 THEN 'Strong Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END AS captain_rating,

    -- DETERMINISTIC ai_recommendation (AI does NOT decide BUY/SELL/HOLD)
    -- Override constraints: OVERPRICED => SELL, high volatility (>=70) => SELL
    CASE
      -- Hard overrides first
      WHEN CASE
        WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN 'NO_PRICE'
        WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) < 95 THEN 'OVERPRICED'
        ELSE 'OK'
      END = 'OVERPRICED'
        OR COALESCE(nr.volatility_score, 50.0) >= 70.0
        THEN 'SELL'
      -- BUY: strong value + high projection + low risk
      WHEN COALESCE(nr.value_score, 0) >= 115
        AND nr.projection::numeric >= 100
        AND COALESCE(nr.volatility_score, 50.0) <= 40
        THEN 'BUY'
      -- HOLD: decent value + reasonable projection
      WHEN COALESCE(nr.value_score, 0) >= 100
        AND nr.projection::numeric >= 90
        THEN 'HOLD'
      -- SELL: poor value or high risk already handled above; catch remaining low-value
      WHEN COALESCE(nr.value_score, 0) < 90
        THEN 'SELL'
      ELSE 'HOLD'
    END                                                                         AS ai_recommendation,

    -- recommendation_color matches deterministic recommendation
    CASE
      WHEN (
        CASE
          WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN 'NO_PRICE'
          WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) < 95 THEN 'OVERPRICED'
          ELSE 'OK'
        END = 'OVERPRICED'
        OR COALESCE(nr.volatility_score, 50.0) >= 70.0
        OR COALESCE(nr.value_score, 0) < 90
      ) THEN 'red'
      WHEN COALESCE(nr.value_score, 0) >= 115
        AND nr.projection::numeric >= 100
        AND COALESCE(nr.volatility_score, 50.0) <= 40
        THEN 'green'
      ELSE 'grey'
    END                                                                         AS recommendation_color,

    -- AI still provides the narrative (summary_short = recommendation_why, summary_long = ai_summary)
    aia.summary_short                                                           AS recommendation_short,
    aia.summary_short                                                           AS recommendation_why,
    aia.summary_long                                                            AS ai_summary,
    aia.generated_at                                                            AS ai_updated_at,

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
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$function$;
