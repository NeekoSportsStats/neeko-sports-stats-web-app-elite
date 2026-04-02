/*
  # Fix Populate Rankings Cache - Risk and Matchup Type Corrections
  
  ## Problem
  Source: afl.mv_player_projection
  - risk is TEXT (contains "MODERATE", "HIGH", "LOW")
  - matchup_rating is NUMERIC
  
  Destination: afl.player_rankings_cache
  - risk_rating is DOUBLE PRECISION
  - matchup_rating is TEXT
  
  ## Solution
  - risk_rating: Use default 50.0 (source is text label, not numeric)
  - matchup_rating: Cast numeric to text
*/

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count        integer;
  v_snapshot_id  uuid := gen_random_uuid();
BEGIN
  SET LOCAL statement_timeout = '120s';

  WITH round1_prices AS (
    SELECT 
      player_id,
      price AS price_r1
    FROM afl.player_prices
    WHERE season = 2026 AND round = 1
  )
  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, team_id, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score,
    price, prev_price, price_change, price_change_pct,
    breakeven,
    value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at,
    cache_snapshot_id,
    status, is_available,
    bye_round, is_bye, bye_next_round
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name,
    pp.team_name,
    pp.team_id,
    pp.position,
    pp.position,
    pp.projection::numeric AS projection_final,
    pp.projection::double precision,
    pp.ceiling::double precision,
    pp.floor::double precision,
    pp.consistency::double precision,
    pp.form_score::double precision,
    pp.neeko_rating::double precision,
    pp.value_score::double precision AS best_value_score,
    
    pp.price::integer,
    COALESCE(r1.price_r1, pp.price)::integer AS prev_price,
    (pp.price - COALESCE(r1.price_r1, pp.price))::integer AS price_change,
    CASE WHEN COALESCE(r1.price_r1, pp.price) > 0
      THEN round(((pp.price - COALESCE(r1.price_r1, pp.price))::numeric / COALESCE(r1.price_r1, pp.price)) * 100, 1)
      ELSE 0.0
    END::double precision AS price_change_pct,
    
    COALESCE(pp.season_avg, ROUND(pp.price::numeric / 7200.0, 0))::integer AS breakeven,
    
    pp.value_score::double precision,
    CASE
      WHEN pp.value_score >= 15 THEN 'Premium Value'
      WHEN pp.value_score >= 5  THEN 'Good Value'
      WHEN pp.value_score >= -5 THEN 'Fair Value'
      WHEN pp.value_score >= -15 THEN 'Poor Value'
      ELSE 'Overpriced'
    END AS value_tag,
    CASE
      WHEN pp.value_score >= 15 THEN 'Premium'
      WHEN pp.value_score >= 5  THEN 'Strong'
      WHEN pp.value_score >= -5 THEN 'Fair'
      ELSE 'Weak'
    END AS value_tier,
    
    pp.confidence::double precision AS projection_confidence,
    50.0::double precision AS risk_rating,  -- Default: source is TEXT label
    pp.matchup_rating::text AS matchup_rating,  -- Numeric to text
    ((pp.ceiling - pp.projection) / NULLIF(pp.projection, 0) * 100)::double precision AS upside_rating,
    
    GREATEST(0, LEAST(100, 
      (pp.projection::numeric * 0.65) + 
      (pp.consistency::numeric * 0.35)
    ))::double precision AS captain_score,
    CASE
      WHEN ((pp.projection::numeric * 0.65) + (pp.consistency::numeric * 0.35)) >= 90 THEN 'Elite Captain'
      WHEN ((pp.projection::numeric * 0.65) + (pp.consistency::numeric * 0.35)) >= 75 THEN 'Strong Captain'
      WHEN ((pp.projection::numeric * 0.65) + (pp.consistency::numeric * 0.35)) >= 60 THEN 'Viable Captain'
      ELSE 'Avoid Captain'
    END AS captain_rating,
    
    ai_rec.recommendation_label,
    ai_rec.recommendation_color,
    ai_rec.recommendation_short,
    ai_rec.recommendation_short AS recommendation_why,
    ai_ana.analysis AS ai_summary,
    ai_ana.generated_at,
    
    pp.confidence_tier AS consistency_tier,
    0 AS total_count,
    now() AS cached_at,
    now() AS created_at,
    v_snapshot_id,
    
    CASE
      WHEN COALESCE(p.active, true) = false THEN 'inactive'
      WHEN COALESCE(p.manual_status, '') IN ('RETIRED', 'injured', 'suspended') THEN 'inactive'
      ELSE 'active'
    END AS status,
    
    (
      COALESCE(p.active, true) = true
      AND COALESCE(p.manual_status, '') NOT IN ('RETIRED', 'injured', 'suspended')
      AND COALESCE(tb.is_bye_active, FALSE) = false
    ) AS is_available,
    
    tb.bye_round,
    COALESCE(tb.is_bye_active, FALSE) AS is_bye,
    FALSE AS bye_next_round
    
  FROM afl.mv_player_projection pp
  LEFT JOIN afl.players p ON p.player_id = pp.player_id
  LEFT JOIN afl.team_byes tb ON tb.team_id = pp.team_id AND tb.season = 2026
  LEFT JOIN round1_prices r1 ON r1.player_id = pp.player_id
  LEFT JOIN public.ai_rankings_player_recos ai_rec ON ai_rec.player_id = pp.player_id
  LEFT JOIN public.ai_player_analysis ai_ana ON ai_ana.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL
    AND (p.player_id IS NULL OR COALESCE(p.manual_status, '') NOT IN ('RETIRED'))
    AND (p.player_id IS NULL OR COALESCE(p.active, true) = true)
    AND COALESCE(tb.is_bye_active, FALSE) = false
  
  ON CONFLICT (player_id) DO UPDATE
  SET
    player_name = EXCLUDED.player_name,
    team = EXCLUDED.team,
    team_name = EXCLUDED.team_name,
    team_id = EXCLUDED.team_id,
    position = EXCLUDED.position,
    position_group = EXCLUDED.position_group,
    projection_final = EXCLUDED.projection_final,
    projection = EXCLUDED.projection,
    ceiling = EXCLUDED.ceiling,
    floor = EXCLUDED.floor,
    consistency = EXCLUDED.consistency,
    form_score = EXCLUDED.form_score,
    neeko_rating = EXCLUDED.neeko_rating,
    best_value_score = EXCLUDED.best_value_score,
    price = EXCLUDED.price,
    prev_price = EXCLUDED.prev_price,
    price_change = EXCLUDED.price_change,
    price_change_pct = EXCLUDED.price_change_pct,
    breakeven = EXCLUDED.breakeven,
    value_score = EXCLUDED.value_score,
    value_tag = EXCLUDED.value_tag,
    value_tier = EXCLUDED.value_tier,
    projection_confidence = EXCLUDED.projection_confidence,
    risk_rating = EXCLUDED.risk_rating,
    matchup_rating = EXCLUDED.matchup_rating,
    upside_rating = EXCLUDED.upside_rating,
    captain_score = EXCLUDED.captain_score,
    captain_rating = EXCLUDED.captain_rating,
    ai_recommendation = EXCLUDED.ai_recommendation,
    recommendation_color = EXCLUDED.recommendation_color,
    recommendation_short = EXCLUDED.recommendation_short,
    recommendation_why = EXCLUDED.recommendation_why,
    ai_summary = EXCLUDED.ai_summary,
    ai_updated_at = EXCLUDED.ai_updated_at,
    consistency_tier = EXCLUDED.consistency_tier,
    cached_at = EXCLUDED.cached_at,
    cache_snapshot_id = EXCLUDED.cache_snapshot_id,
    status = EXCLUDED.status,
    is_available = EXCLUDED.is_available,
    bye_round = EXCLUDED.bye_round,
    is_bye = EXCLUDED.is_bye,
    bye_next_round = EXCLUDED.bye_next_round;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
