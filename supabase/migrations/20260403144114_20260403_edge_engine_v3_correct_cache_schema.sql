/*
  # Edge Engine V3 — Multi-Factor Formula (Correct Cache Schema)

  Fixes column mapping to match actual afl.player_rankings_cache schema.

  Key schema facts discovered:
  - No season_avg / last3_avg / last5_avg / last10_avg in cache
  - matchup_rating is TEXT in cache
  - recommendation_strength is TEXT in cache
  - ceiling_estimate / floor_estimate are GENERATED (skip)
  - consistency column exists (not consistency_score)
*/

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id,
    player_name,
    team,
    team_name,
    position,
    price,
    breakeven,
    projection_final,
    form_score,
    neeko_rating,
    value_score,
    edge_score,
    edge_tier,
    upside_rating,
    risk_rating,
    ai_recommendation,
    recommendation_color,
    recommendation_strength,
    market_watch_category,
    consistency,
    matchup_rating,
    is_available,
    status,
    manual_status,
    is_bye,
    bye_round,
    bye_next_round,
    cached_at
  )
  WITH edge AS (
    SELECT
      pp.player_id,
      -- Component A: Base performance vs pool average (~63pts)
      (pp.projection - 63.0) * 0.5 AS edge_base,
      -- Component B: Recent form trend (last5 vs projection)
      (COALESCE(pp.last5_avg, pp.projection) - pp.projection) * 0.30 AS edge_form,
      -- Component C: Ceiling upside net of volatility (ceiling - proj - stddev)
      (COALESCE(pp.ceiling, pp.projection + 10)::numeric - pp.projection - COALESCE(pp.stddev_last10, 19.0)) * 0.15 AS edge_ceiling,
      -- Component D: Matchup quality (multiplier centered at 1.0)
      (COALESCE(pp.matchup_rating, 1.0) - 1.0) * 20.0 AS edge_matchup,
      -- Component E: Role stability (0–100 scale, pool mean=66, sd=11.74)
      (COALESCE(pp.stability_score, 66.0) - 66.0) / 11.74 * 2.5 AS edge_role
    FROM afl.mv_player_projection pp
    WHERE pp.player_id IS NOT NULL
  ),
  edge_scored AS (
    SELECT
      player_id,
      GREATEST(-20.0, LEAST(20.0,
        edge_base + edge_form + edge_ceiling + edge_matchup + edge_role
      ))::numeric AS edge_val
    FROM edge
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name AS team,
    pp.team_name,
    pp.position,
    pp.price,
    -- Breakeven approximation
    CASE
      WHEN pp.season_avg > 0
        THEN ROUND((pp.price::numeric / 6000.0))
      ELSE NULL
    END AS breakeven,
    pp.projection AS projection_final,
    pp.form_score,
    pp.neeko_rating,
    pp.value_score,
    -- EDGE SCORE (clamped -20 to +20, numeric)
    e.edge_val AS edge_score,
    -- EDGE TIER (text)
    CASE
      WHEN e.edge_val >= 12  THEN 'ELITE'
      WHEN e.edge_val >= 6   THEN 'STRONG'
      WHEN e.edge_val >= -6  THEN 'NEUTRAL'
      WHEN e.edge_val >= -12 THEN 'WEAK'
      ELSE 'AVOID'
    END AS edge_tier,
    -- UPSIDE RATING (double precision)
    CASE
      WHEN e.edge_val >= 6   THEN 1.30
      WHEN e.edge_val >= -6  THEN 1.15
      ELSE 1.0
    END AS upside_rating,
    -- RISK RATING (double precision)
    COALESCE(pp.volatility_score, 50.0) AS risk_rating,
    -- AI RECOMMENDATION (5-tier, text)
    CASE
      WHEN e.edge_val >= 12  THEN 'STRONG_BUY'
      WHEN e.edge_val >= 6   THEN 'BUY'
      WHEN e.edge_val <= -12 THEN 'STRONG_SELL'
      WHEN e.edge_val <= -6  THEN 'SELL'
      ELSE 'HOLD'
    END AS ai_recommendation,
    -- RECOMMENDATION COLOR (text)
    CASE
      WHEN e.edge_val >= 12  THEN 'green'
      WHEN e.edge_val >= 6   THEN 'emerald'
      WHEN e.edge_val <= -12 THEN 'red'
      WHEN e.edge_val <= -6  THEN 'orange'
      ELSE 'amber'
    END AS recommendation_color,
    -- RECOMMENDATION STRENGTH (text, 0-100 as string)
    ROUND(LEAST(100.0, GREATEST(0.0, (e.edge_val + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS recommendation_strength,
    -- MARKET WATCH CATEGORY (text)
    CASE
      WHEN e.edge_val >= 6  THEN 'Target'
      WHEN e.edge_val <= -6 THEN 'Avoid'
      ELSE 'Watch'
    END AS market_watch_category,
    -- CONSISTENCY (double precision)
    COALESCE(pp.consistency, 50.0) AS consistency,
    -- MATCHUP RATING (text in cache)
    CASE
      WHEN pp.matchup_rating >= 1.05 THEN 'Favourable'
      WHEN pp.matchup_rating <= 0.95 THEN 'Tough'
      ELSE 'Neutral'
    END AS matchup_rating,
    -- AVAILABILITY
    true AS is_available,
    NULL::text AS status,
    NULL::text AS manual_status,
    false AS is_bye,
    NULL::integer AS bye_round,
    false AS bye_next_round,
    NOW() AS cached_at
  FROM afl.mv_player_projection pp
  JOIN edge_scored e ON e.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL;

END;
$$;
