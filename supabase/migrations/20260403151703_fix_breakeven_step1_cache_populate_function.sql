/*
  # Fix Breakeven Step 1 — Update populate_rankings_cache_from_source()

  Changes the breakeven formula from:
    ROUND(price / 6000.0)  → wrong divisor (~167 for $1M player)
  To:
    Stabilised: price / 7200 blended 70% raw + 30% projection
    Caps: raw < 20 keep raw; raw > 180 use projection

  This is the canonical single source of truth for breakeven.
  All frontend pages read player.breakeven from afl.player_rankings_cache.
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN

DELETE FROM afl.player_rankings_cache;

INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, position, price, breakeven,
projection_final, form_score, neeko_rating, value_score,
edge_score, edge_tier, upside_rating, risk_rating,
ai_recommendation, recommendation_color, recommendation_strength,
market_watch_category, consistency, matchup_rating,
is_available, status, manual_status, is_bye, bye_round, bye_next_round,
edge_c_base, edge_c_form, edge_c_ceiling, edge_c_opponent,
edge_c_venue, edge_c_role, edge_c_momentum, edge_c_breakout, edge_c_risk,
cached_at
)
WITH components AS (
SELECT
pp.player_id,
pp.games_played,
(pp.projection - 63.0) * 0.22 AS c_base,
(COALESCE(pp.last3_avg, pp.last5_avg, pp.projection) - pp.projection) * 0.14 AS c_form,
(COALESCE(pp.ceiling, pp.projection + 10)::numeric - pp.projection - COALESCE(pp.stddev_last10, 19.0)) * 0.14 AS c_ceiling,
(COALESCE(pp.position_concession_multiplier, 1.0) - 1.0) * 30.0 AS c_opponent,
CASE WHEN COALESCE(pp.rest_days, 7) < 5 THEN -2.0 ELSE 0.0 END AS c_venue,
CASE
WHEN COALESCE(pp.games_played, 0) >= 3 THEN
(COALESCE(pp.stability_score, 66.0) - 66.0) / 11.74 * 2.0
ELSE 0.0
END AS c_role,
COALESCE(pp.form_momentum, 0) * 0.06 AS c_momentum,
CASE
WHEN COALESCE(pp.games_played, 0) >= 3 THEN
(COALESCE(pp.breakout_probability, 0.31) - 0.31) * 8.0
ELSE 0.0
END AS c_breakout,
CASE
WHEN COALESCE(pp.games_played, 0) >= 3 THEN
(COALESCE(pp.consistency, 66.0) - 66.0) / 11.74 * 1.5
- (COALESCE(pp.volatility_score, 34.0) - 34.0) / 11.74 * 1.5
ELSE 0.0
END AS c_risk,

-- STABILISED BREAKEVEN (canonical)
-- Base: price / 7200 (AFL Fantasy standard)
-- Stabilise: 70% price signal + 30% projection
-- Caps: <20 keep raw, >180 fall back to projection
CASE
WHEN pp.price IS NULL OR pp.price = 0
THEN pp.projection::numeric
WHEN (pp.price::numeric / 7200.0) < 20
THEN (pp.price::numeric / 7200.0)
WHEN (pp.price::numeric / 7200.0) > 180
THEN pp.projection::numeric
ELSE
  (pp.price::numeric / 7200.0) * 0.7 + pp.projection::numeric * 0.3
END AS breakeven_stabilised

FROM afl.mv_player_projection pp
WHERE pp.player_id IS NOT NULL
),
edge_scored AS (
SELECT
c.player_id,
c.games_played,
c.c_base, c.c_form, c.c_ceiling, c.c_opponent,
c.c_venue, c.c_role, c.c_momentum, c.c_breakout, c.c_risk,
c.breakeven_stabilised,
GREATEST(-20.0, LEAST(20.0,
c.c_base + c.c_form + c.c_ceiling + c.c_opponent + c.c_venue
+ c.c_role + c.c_momentum + c.c_breakout + c.c_risk
))::numeric AS edge_val
FROM components c
)
SELECT
pp.player_id,
pp.player_name,
pp.team_name AS team,
pp.team_name,
pp.position,
pp.price,
e.breakeven_stabilised::numeric(5,1) AS breakeven,
pp.projection AS projection_final,
pp.form_score,
pp.neeko_rating,
pp.value_score,
e.edge_val AS edge_score,
CASE
WHEN e.edge_val >= 13 THEN 'ELITE'
WHEN e.edge_val >= 6  THEN 'STRONG'
WHEN e.edge_val >= -6 THEN 'NEUTRAL'
WHEN e.edge_val >= -9 THEN 'WEAK'
ELSE 'AVOID'
END AS edge_tier,
CASE
WHEN e.edge_val >= 13 THEN 1.40
WHEN e.edge_val >= 6  THEN 1.25
WHEN e.edge_val >= -6 THEN 1.10
ELSE 1.0
END AS upside_rating,
COALESCE(pp.volatility_score, 50.0) AS risk_rating,
CASE
WHEN e.edge_val >= 13   THEN 'STRONG_BUY'
WHEN e.edge_val >= 6    THEN 'BUY'
WHEN e.edge_val <= -9   THEN 'STRONG_SELL'
WHEN e.edge_val <= -6   THEN 'SELL'
ELSE 'HOLD'
END AS ai_recommendation,
CASE
WHEN e.edge_val >= 13   THEN 'green'
WHEN e.edge_val >= 6    THEN 'emerald'
WHEN e.edge_val <= -9   THEN 'red'
WHEN e.edge_val <= -6   THEN 'orange'
ELSE 'amber'
END AS recommendation_color,
ROUND(LEAST(100.0, GREATEST(0.0, (e.edge_val + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS recommendation_strength,
CASE
WHEN e.edge_val >= 6                          THEN 'Target'
WHEN e.edge_val <= -6 AND pp.value_score < 0  THEN 'Avoid'
ELSE 'Watch'
END AS market_watch_category,
COALESCE(pp.consistency, 50.0) AS consistency,
CASE
WHEN COALESCE(pp.matchup_rating, 1.0) >= 1.05 THEN 'Favourable'
WHEN COALESCE(pp.matchup_rating, 1.0) <= 0.95 THEN 'Tough'
ELSE 'Neutral'
END AS matchup_rating,
true AS is_available,
NULL::text AS status,
NULL::text AS manual_status,
false AS is_bye,
NULL::integer AS bye_round,
false AS bye_next_round,
ROUND(e.c_base::numeric, 3),
ROUND(e.c_form::numeric, 3),
ROUND(e.c_ceiling::numeric, 3),
ROUND(e.c_opponent::numeric, 3),
ROUND(e.c_venue::numeric, 3),
ROUND(e.c_role::numeric, 3),
ROUND(e.c_momentum::numeric, 3),
ROUND(e.c_breakout::numeric, 3),
ROUND(e.c_risk::numeric, 3),
NOW() AS cached_at
FROM afl.mv_player_projection pp
JOIN edge_scored e ON e.player_id = pp.player_id
WHERE pp.player_id IS NOT NULL;

END;
$function$;

-- Run cache refresh immediately
SELECT afl.populate_rankings_cache_from_source();
