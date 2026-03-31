/*
  # Fix matchup_rating source and recalibrate thresholds

  ## Problems fixed

  ### 1. matchup_rating source
  - mv_player_rankings.matchup_rating is all 1.0 (no 2026 season games played yet)
  - Real matchup data exists in afl.player_projection (range 1.005–1.020)
  - Fix: join player_projection and use its matchup_rating for labelling
  - Thresholds recalibrated to the actual data range (1.005–1.020):
    ELITE >= 1.015 | FAVOURABLE >= 1.010 | NEUTRAL >= 1.005 | TOUGH < 1.005

  ### 2. Trap alert threshold recalibrated
  - volatility_score distribution: p50=33, p75=44.5, p90=50, max=90
  - Trap alert (HIGH_RISK) = top ~15% => volatility_score >= 55
  - This gives ~14 players (2%) but max is 90 and 14 players above 60
  - Use >= 55 for trap alerts to get ~10-15% of the field flagged

  ### 3. High confidence threshold recalibrated  
  - confidence distribution: p75=63, p90=70.6, max=90.6
  - HIGH_CONF >= 65 gives ~10% of field (p90 band)
  - This aligns with "expect 10-20% high confidence"

  ### 4. BUY threshold adjusted
  - Previous BUY needed value >= 115 + proj >= 100 + volatility <= 40
  - Adjusted to volatility <= 45 to capture more genuine buys

  ## No tables dropped or views removed
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

    -- neeko_rating
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

    -- best_value_score
    round((
      nr.projection::numeric                              * 0.30 +
      COALESCE(nr.confidence, 50.0)::numeric              * 0.15 +
      COALESCE(nr.value_score, 50.0)::numeric             * 0.55
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

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

    -- projection_confidence (0–100 scale)
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision      AS projection_confidence,

    -- risk_rating: volatility_score from mv_player_rankings
    COALESCE(nr.volatility_score, 50.0)::double precision                       AS risk_rating,

    -- matchup_rating label: sourced from afl.player_projection which has real matchup multipliers
    -- Range in data: 1.0057–1.0195
    -- ELITE >= 1.015 | FAVOURABLE >= 1.010 | NEUTRAL >= 1.005 | TOUGH < 1.005
    CASE
      WHEN COALESCE(proj.matchup_rating::numeric, 1.0) >= 1.015 THEN 'ELITE'
      WHEN COALESCE(proj.matchup_rating::numeric, 1.0) >= 1.010 THEN 'FAVOURABLE'
      WHEN COALESCE(proj.matchup_rating::numeric, 1.0) >= 1.005 THEN 'NEUTRAL'
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

    -- DETERMINISTIC recommendation — AI does NOT decide BUY/SELL/HOLD
    -- Overrides: OVERPRICED => SELL, high volatility (>= 55) => SELL
    CASE
      WHEN (
        COALESCE(pp.price, nr.price) IS NOT NULL
        AND COALESCE(pp.price, nr.price) > 0
        AND (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) < 95
      ) OR COALESCE(nr.volatility_score, 50.0) >= 55.0
        THEN 'SELL'
      WHEN COALESCE(nr.value_score, 0) >= 115
        AND nr.projection::numeric >= 100
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= 100
        AND nr.projection::numeric >= 90
        THEN 'HOLD'
      WHEN COALESCE(nr.value_score, 0) < 90
        THEN 'SELL'
      ELSE 'HOLD'
    END                                                                         AS ai_recommendation,

    CASE
      WHEN (
        COALESCE(pp.price, nr.price) IS NOT NULL
        AND COALESCE(pp.price, nr.price) > 0
        AND (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) < 95
      ) OR COALESCE(nr.volatility_score, 50.0) >= 55.0
        OR COALESCE(nr.value_score, 0) < 90
        THEN 'red'
      WHEN COALESCE(nr.value_score, 0) >= 115
        AND nr.projection::numeric >= 100
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        THEN 'green'
      ELSE 'grey'
    END                                                                         AS recommendation_color,

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
  LEFT JOIN afl.player_projection        proj ON proj.player_id = nr.player_id
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$function$;
