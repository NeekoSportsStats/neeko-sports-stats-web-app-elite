/*
  # Edge v3 Threshold Calibration (Post-Rebuild)

  ## Summary
  After the weight rebalance, the score distribution shifted:
  - sd dropped from 10.6 to 6.94
  - Upper tail compressed (max 20, p95 = 12.7)
  - Lower tail compressed by low-data guard (min -17.6, p5 = -9.1)

  The symmetric ±14 STRONG thresholds are now too wide on the upside and
  too tight on the downside, producing 3.4% STRONG_BUY and 0.5% STRONG_SELL.

  ## Calibrated Asymmetric Thresholds
  - STRONG_BUY  >= 13   → 4.6% (28 players) — within 3–8% target
  - BUY         >= 6    → 17.6% — within 12–22% target
  - HOLD        -6 to 6 → ~60% — within 45–60% upper bound
  - SELL        <= -6   → ~18% — within 12–22% target
  - STRONG_SELL <= -9   → 5.6% (34 players) — within 3–8% target

  The asymmetry is justified: the buy-side has more data-rich players driving
  strong signals, while the sell-side lost the false-penalty cluster via the
  low-data guard.

  ## Security
  No RLS changes. Function remains SECURITY DEFINER.
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

    -- (A) Base: projection vs pool average (63)
    -- weight 0.22 (reduced from 0.32 to cut projection dominance)
    (pp.projection - 63.0) * 0.22 AS c_base,

    -- (B) Form trend: last3 vs projection
    (COALESCE(pp.last3_avg, pp.last5_avg, pp.projection) - pp.projection) * 0.14 AS c_form,

    -- (C) Ceiling upside net of volatility
    -- weight 0.14 (raised from 0.10 for better captain differentiation)
    (COALESCE(pp.ceiling, pp.projection + 10)::numeric - pp.projection - COALESCE(pp.stddev_last10, 19.0)) * 0.14 AS c_ceiling,

    -- (D) Opponent position concession
    (COALESCE(pp.position_concession_multiplier, 1.0) - 1.0) * 30.0 AS c_opponent,

    -- (E) Short turnaround penalty (replaces dead venue signal)
    CASE
      WHEN COALESCE(pp.rest_days, 7) < 5 THEN -2.0
      ELSE 0.0
    END AS c_venue,

    -- (F) Role stability — zeroed for < 3 games (low-data guard)
    CASE
      WHEN COALESCE(pp.games_played, 0) >= 3 THEN
        (COALESCE(pp.stability_score, 66.0) - 66.0) / 11.74 * 2.0
      ELSE 0.0
    END AS c_role,

    -- (G) Form momentum
    COALESCE(pp.form_momentum, 0) * 0.06 AS c_momentum,

    -- (H) Breakout signal — zeroed for < 3 games (low-data guard)
    CASE
      WHEN COALESCE(pp.games_played, 0) >= 3 THEN
        (COALESCE(pp.breakout_probability, 0.31) - 0.31) * 8.0
      ELSE 0.0
    END AS c_breakout,

    -- (I) Consistency minus volatility — zeroed for < 3 games (low-data guard)
    CASE
      WHEN COALESCE(pp.games_played, 0) >= 3 THEN
        (COALESCE(pp.consistency, 66.0) - 66.0) / 11.74 * 1.5
        - (COALESCE(pp.volatility_score, 34.0) - 34.0) / 11.74 * 1.5
      ELSE 0.0
    END AS c_risk

  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
),
edge_scored AS (
  SELECT
    c.player_id,
    c.games_played,
    c.c_base, c.c_form, c.c_ceiling, c.c_opponent,
    c.c_venue, c.c_role, c.c_momentum, c.c_breakout, c.c_risk,
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
  CASE WHEN pp.season_avg > 0 THEN ROUND((pp.price::numeric / 6000.0)) ELSE NULL END AS breakeven,
  pp.projection AS projection_final,
  pp.form_score,
  pp.neeko_rating,
  pp.value_score,

  e.edge_val AS edge_score,

  -- Edge tier labels (calibrated to new thresholds)
  CASE
    WHEN e.edge_val >= 13 THEN 'ELITE'
    WHEN e.edge_val >= 6  THEN 'STRONG'
    WHEN e.edge_val >= -6 THEN 'NEUTRAL'
    WHEN e.edge_val >= -9 THEN 'WEAK'
    ELSE 'AVOID'
  END AS edge_tier,

  -- Upside rating
  CASE
    WHEN e.edge_val >= 13 THEN 1.40
    WHEN e.edge_val >= 6  THEN 1.25
    WHEN e.edge_val >= -6 THEN 1.10
    ELSE 1.0
  END AS upside_rating,

  COALESCE(pp.volatility_score, 50.0) AS risk_rating,

  -- AI recommendation — calibrated asymmetric thresholds
  -- STRONG_BUY >= 13 (4.6%), BUY >= 6, HOLD -6 to 6, SELL <= -6, STRONG_SELL <= -9 (5.6%)
  CASE
    WHEN e.edge_val >= 13   THEN 'STRONG_BUY'
    WHEN e.edge_val >= 6    THEN 'BUY'
    WHEN e.edge_val <= -9   THEN 'STRONG_SELL'
    WHEN e.edge_val <= -6   THEN 'SELL'
    ELSE 'HOLD'
  END AS ai_recommendation,

  -- Recommendation color
  CASE
    WHEN e.edge_val >= 13   THEN 'green'
    WHEN e.edge_val >= 6    THEN 'emerald'
    WHEN e.edge_val <= -9   THEN 'red'
    WHEN e.edge_val <= -6   THEN 'orange'
    ELSE 'amber'
  END AS recommendation_color,

  ROUND(LEAST(100.0, GREATEST(0.0, (e.edge_val + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS recommendation_strength,

  -- Market Watch: high-value SELL players go to Watch, not Avoid
  CASE
    WHEN e.edge_val >= 6                          THEN 'Target'
    WHEN e.edge_val <= -6 AND pp.value_score < 0  THEN 'Avoid'
    WHEN e.edge_val <= -6 AND pp.value_score >= 0 THEN 'Watch'
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
