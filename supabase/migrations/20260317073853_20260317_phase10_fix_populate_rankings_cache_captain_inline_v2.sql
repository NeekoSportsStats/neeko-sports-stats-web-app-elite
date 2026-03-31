/*
  # Fix populate_rankings_cache_from_source — captain score inline (v2)

  ## Problem
  Function referenced afl.v_captain_scores which does not exist.
  Must DROP before recreating due to return type change.

  ## Fix
  Compute captain_score inline from mv_player_rankings fields.
*/

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
BEGIN
  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score, price, value_score, value_tag, value_tier,
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
    nr.neeko_rating::double precision                               AS neeko_rating,
    round((
      nr.projection::numeric                              * 0.50
      + COALESCE(nr.value_score, 50.0)::numeric          * 0.30
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                         AS best_value_score,
    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 12 THEN 'ELITE VALUE'
      WHEN nr.value_score >= 9  THEN 'STRONG VALUE'
      WHEN nr.value_score >= 6  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 12 THEN 'ELITE VALUE'
      WHEN nr.value_score >= 9  THEN 'STRONG VALUE'
      WHEN nr.value_score >= 6  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision  AS projection_confidence,
    COALESCE(nr.volatility_score, 50.0)::double precision                   AS risk_rating,
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

    -- captain_score: inline formula — no external view needed
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

    CASE
      WHEN COALESCE(nr.value_score, 0) >= 11
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= 8
        AND nr.projection::numeric >= 80
      THEN 'HOLD'
      ELSE 'SELL'
    END                                                              AS ai_recommendation,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= 11
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'green'
      WHEN COALESCE(nr.value_score, 0) >= 8
        AND nr.projection::numeric >= 80
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
