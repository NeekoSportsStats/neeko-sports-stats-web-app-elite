/*
  # Fix populate_rankings_cache_from_source v4

  ## Changes from v3
  - Replace afl.player_prices_import (does not exist) with afl.player_prices (correct table)
  - Column is price (lowercase, no quotes) not "PRICE"
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $func$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, price, value_score, value_tag, value_tier,
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
    nr.projection::numeric                                                AS projection_final,
    nr.projection::double precision                                       AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,
    nr.neeko_rating::double precision,
    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision          AS projection_confidence,
    COALESCE(risk.volatility_score, 50.0)::double precision                         AS risk_rating,
    COALESCE(nr.matchup_rating::text, 'Neutral')                                    AS matchup_rating,
    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100, COALESCE(cap.captain_score, 0)))::double precision       AS captain_score,
    CASE
      WHEN COALESCE(cap.captain_score, 0) >= 85 THEN 'Elite Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 70 THEN 'Strong Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END AS captain_rating,
    aia.recommendation                                                              AS ai_recommendation,
    CASE COALESCE(aia.recommendation, '')
      WHEN 'BUY'   THEN 'green'
      WHEN 'START' THEN 'teal'
      WHEN 'SELL'  THEN 'red'
      WHEN 'SIT'   THEN 'yellow'
      ELSE 'grey'
    END AS recommendation_color,
    aia.summary_short                                                               AS recommendation_short,
    aia.summary_short                                                               AS recommendation_why,
    aia.summary_long                                                                AS ai_summary,
    aia.generated_at                                                                AS ai_updated_at,
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
  LEFT JOIN afl.player_prices            pp   ON pp.player_id   = nr.player_id
  LEFT JOIN afl.v_player_risk_model      risk ON risk.player_id = nr.player_id
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id  = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$func$;
