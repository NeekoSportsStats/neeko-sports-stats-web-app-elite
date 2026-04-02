/*
  # Fix Populate Cache - Use Available Data Sources
  
  ## Problem
  Function references non-existent mv_player_rankings view.
  Need to use afl.player_projection table instead.
  
  ## Solution
  Rebuild function to pull from afl.player_projection directly.
  Preserve all ACTIVE filtering logic.
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

  WITH season_avg AS (
    SELECT
      player_id,
      ROUND(AVG(fantasy_score)::numeric, 0)::integer AS avg_2026
    FROM afl.player_games
    WHERE season = 2026
      AND fantasy_score IS NOT NULL
    GROUP BY player_id
  ),
  current_prices AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      price
    FROM afl.player_prices
    WHERE season = 2026
    ORDER BY player_id, round DESC
  ),
  round1_prices AS (
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
    p.player_name,
    p.team,
    p.team,
    t.team_id,
    p.position,
    p.position,
    pp.projection_final::numeric,
    pp.projection_final::double precision,
    pp.ceiling::double precision,
    pp.floor::double precision,
    pp.consistency_score::double precision,
    pp.form_score::double precision,
    round((
      (pp.projection_final::numeric * 0.55) +
      (COALESCE(pp.confidence, 50.0)::numeric * 0.23) +
      (COALESCE(pp.consistency_score, 50.0)::numeric * 0.17) +
      (LEAST(COALESCE(pp.value_score, 0.0)::numeric + 50.0, 100.0) * 0.05)
    ), 1)::double precision AS neeko_rating,
    pp.value_score::double precision,
    
    COALESCE(cp.price, 450000)::integer,
    COALESCE(r1.price_r1, cp.price, 450000)::integer,
    (COALESCE(cp.price, 450000) - COALESCE(r1.price_r1, cp.price, 450000))::integer,
    CASE WHEN COALESCE(r1.price_r1, cp.price, 450000) > 0
      THEN round(((COALESCE(cp.price, 450000) - COALESCE(r1.price_r1, cp.price, 450000))::numeric / COALESCE(r1.price_r1, cp.price, 450000)) * 100, 1)
      ELSE 0.0
    END::double precision,
    
    COALESCE(sa.avg_2026, ROUND(COALESCE(cp.price, 450000)::numeric / 7200.0, 0)::integer),
    
    pp.value_score::double precision,
    CASE
      WHEN pp.value_score >= 15 THEN 'Premium Value'
      WHEN pp.value_score >= 5  THEN 'Good Value'
      WHEN pp.value_score >= -5 THEN 'Fair Value'
      WHEN pp.value_score >= -15 THEN 'Poor Value'
      ELSE 'Overpriced'
    END,
    CASE
      WHEN pp.value_score >= 15 THEN 'Premium'
      WHEN pp.value_score >= 5  THEN 'Strong'
      WHEN pp.value_score >= -5 THEN 'Fair'
      ELSE 'Weak'
    END,
    
    pp.confidence::double precision,
    50.0::double precision AS risk_rating,
    pp.matchup_multiplier::double precision AS matchup_rating,
    ((pp.ceiling - pp.projection_final) / NULLIF(pp.projection_final, 0) * 100)::double precision AS upside_rating,
    
    pp.captain_score::double precision,
    CASE
      WHEN pp.captain_score >= 90 THEN 'Elite Captain'
      WHEN pp.captain_score >= 75 THEN 'Strong Captain'
      WHEN pp.captain_score >= 60 THEN 'Viable Captain'
      ELSE 'Avoid Captain'
    END,
    
    ai_rec.recommendation_label,
    ai_rec.recommendation_color,
    ai_rec.recommendation_short,
    ai_ana.primary_reason,
    ai_ana.ai_summary,
    ai_ana.generated_at,
    
    CASE
      WHEN pp.consistency_score >= 80 THEN 'Consistent'
      WHEN pp.consistency_score >= 60 THEN 'Moderate'
      ELSE 'Volatile'
    END,
    
    0,
    now(),
    now(),
    v_snapshot_id,
    
    -- ACTIVE status check
    CASE
      WHEN COALESCE(p.active, true) = false THEN 'inactive'
      WHEN COALESCE(p.manual_status, '') IN ('RETIRED', 'injured', 'suspended') THEN 'inactive'
      ELSE 'active'
    END,
    
    -- Comprehensive is_available
    (
      COALESCE(p.active, true) = true
      AND COALESCE(p.manual_status, '') NOT IN ('RETIRED', 'injured', 'suspended')
      AND COALESCE(tb.is_bye_active, FALSE) = false
    ),
    
    tb.bye_round,
    COALESCE(tb.is_bye_active, FALSE),
    FALSE
    
  FROM afl.player_projection pp
  INNER JOIN afl.players p ON p.player_id = pp.player_id
  LEFT JOIN afl.teams t ON t.team_name = p.team
  LEFT JOIN afl.team_byes tb ON tb.team_id = t.team_id AND tb.season = 2026
  LEFT JOIN current_prices cp ON cp.player_id = pp.player_id
  LEFT JOIN round1_prices r1 ON r1.player_id = pp.player_id
  LEFT JOIN public.ai_rankings_player_recos ai_rec ON ai_rec.player_id = pp.player_id
  LEFT JOIN public.ai_player_analysis ai_ana ON ai_ana.player_id = pp.player_id
  LEFT JOIN season_avg sa ON sa.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL
    -- CRITICAL: Filter RETIRED/inactive at source
    AND (COALESCE(p.manual_status, '') NOT IN ('RETIRED'))
    AND (COALESCE(p.active, true) = true OR p.active IS NULL)
  
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
