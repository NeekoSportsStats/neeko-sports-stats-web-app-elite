/*
  # Value Score V2 — Normalised + Context-Aware

  ## Summary
  Rebuilds `value_score` inside `afl.populate_rankings_cache_from_source()` with a
  clean, stable, interpretable metric aligned with the breakeven + Edge system.

  ## Key Changes

  ### 1. New Formula
  - **Core gap:** `projection - breakeven` (points above/below expectation)
  - **Normalise:** `value_gap / breakeven` → efficiency ratio (not raw points)
  - **Scale:** multiply by 100 → human-readable range
  - **Clamp:** `LEAST(30, GREATEST(-30, ...))` → prevents extreme noise

  ### 2. Context Adjustments
  - **Consistency boost:** `stddev_last10 < 10 → ×1.1`, `> 25 → ×0.85`
  - **Role confidence:** `stability_score > 70 → ×1.1`, `< 60 → ×0.9`

  ### 3. Value Tiers (stored in `market_watch_category`)
  - ELITE_VALUE ≥ 15, GOOD_VALUE ≥ 6, TRAP ≤ -15, OVERPRICED ≤ -6, FAIR otherwise

  ### 4. Edge/Value Separation
  - `edge_score` = decision signal (unchanged)
  - `value_score` = pricing inefficiency (this change)
  - `market_watch_category` now uses value tiers, NOT edge_score

  ## Notes
  - `value_score` column in cache is `double precision` — no cast needed
  - `breakeven` is already computed in the `components` CTE as `breakeven_stabilised`
  - Uses `stddev_last10` as proxy for `form_std_dev`
  - Uses `stability_score` threshold (>70 HIGH, <60 LOW) as proxy for `role_stability`
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
    -- Edge components (unchanged)
    (pp.projection - 63.0) * 0.22                                                              AS c_base,
    (COALESCE(pp.last3_avg, pp.last5_avg, pp.projection) - pp.projection) * 0.14              AS c_form,
    (COALESCE(pp.ceiling, pp.projection + 10)::numeric - pp.projection
      - COALESCE(pp.stddev_last10, 19.0)) * 0.14                                              AS c_ceiling,
    (COALESCE(pp.position_concession_multiplier, 1.0) - 1.0) * 30.0                           AS c_opponent,
    CASE WHEN COALESCE(pp.rest_days, 7) < 5 THEN -2.0 ELSE 0.0 END                           AS c_venue,
    CASE
      WHEN COALESCE(pp.games_played, 0) >= 3
        THEN (COALESCE(pp.stability_score, 66.0) - 66.0) / 11.74 * 2.0
      ELSE 0.0
    END                                                                                        AS c_role,
    COALESCE(pp.form_momentum, 0) * 0.06                                                      AS c_momentum,
    CASE
      WHEN COALESCE(pp.games_played, 0) >= 3
        THEN (COALESCE(pp.breakout_probability, 0.31) - 0.31) * 8.0
      ELSE 0.0
    END                                                                                        AS c_breakout,
    CASE
      WHEN COALESCE(pp.games_played, 0) >= 3
        THEN (COALESCE(pp.consistency, 66.0) - 66.0) / 11.74 * 1.5
             - (COALESCE(pp.volatility_score, 34.0) - 34.0) / 11.74 * 1.5
      ELSE 0.0
    END                                                                                        AS c_risk,

    -- STABILISED BREAKEVEN (canonical — price/7200 * 0.7 + projection * 0.3)
    CASE
      WHEN pp.price IS NULL OR pp.price = 0
        THEN pp.projection::numeric
      WHEN (pp.price::numeric / 7200.0) < 20
        THEN (pp.price::numeric / 7200.0)
      WHEN (pp.price::numeric / 7200.0) > 180
        THEN pp.projection::numeric
      ELSE
        (pp.price::numeric / 7200.0) * 0.7 + pp.projection::numeric * 0.3
    END AS breakeven_stabilised,

    -- VALUE SCORE V2 INPUTS
    -- Context multipliers for adjustment step
    CASE
      WHEN COALESCE(pp.stddev_last10, 19.0) < 10 THEN 1.1
      WHEN COALESCE(pp.stddev_last10, 19.0) > 25  THEN 0.85
      ELSE 1.0
    END AS consistency_factor,

    CASE
      WHEN COALESCE(pp.stability_score, 66.0) > 70 THEN 1.1
      WHEN COALESCE(pp.stability_score, 66.0) < 60 THEN 0.9
      ELSE 1.0
    END AS role_factor,

    pp.projection::numeric   AS proj,
    pp.stddev_last10,
    pp.stability_score

  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
),
edge_scored AS (
  SELECT
    c.*,
    GREATEST(-20.0, LEAST(20.0,
      c.c_base + c.c_form + c.c_ceiling + c.c_opponent + c.c_venue
      + c.c_role + c.c_momentum + c.c_breakout + c.c_risk
    ))::numeric AS edge_val
  FROM components c
),
value_computed AS (
  SELECT
    e.*,
    -- STEP 1: core gap (projection vs breakeven)
    (e.proj - e.breakeven_stabilised) AS value_gap,

    -- STEP 2: normalise by breakeven → efficiency ratio
    CASE
      WHEN e.breakeven_stabilised = 0 THEN 0.0
      ELSE (e.proj - e.breakeven_stabilised) / NULLIF(e.breakeven_stabilised, 0)
    END AS value_norm,

    -- STEP 3: scale to user range, apply context, clamp
    LEAST(30.0, GREATEST(-30.0,
      ROUND(
        -- base scaled score
        ((e.proj - e.breakeven_stabilised) / NULLIF(e.breakeven_stabilised, 0)) * 100.0
        -- context multipliers
        * e.consistency_factor
        * e.role_factor
      , 1)
    )) AS value_score_v2

  FROM edge_scored e
)
SELECT
  pp.player_id,
  pp.player_name,
  pp.team_name AS team,
  pp.team_name,
  pp.position,
  pp.price,
  -- CANONICAL BREAKEVEN
  v.breakeven_stabilised::numeric(5,1) AS breakeven,
  pp.projection AS projection_final,
  pp.form_score,
  pp.neeko_rating,
  -- VALUE SCORE V2 (normalised + context-aware)
  v.value_score_v2 AS value_score,
  -- EDGE (unchanged)
  v.edge_val AS edge_score,
  CASE
    WHEN v.edge_val >= 13 THEN 'ELITE'
    WHEN v.edge_val >= 6  THEN 'STRONG'
    WHEN v.edge_val >= -6 THEN 'NEUTRAL'
    WHEN v.edge_val >= -9 THEN 'WEAK'
    ELSE 'AVOID'
  END AS edge_tier,
  CASE
    WHEN v.edge_val >= 13 THEN 1.40
    WHEN v.edge_val >= 6  THEN 1.25
    WHEN v.edge_val >= -6 THEN 1.10
    ELSE 1.0
  END AS upside_rating,
  COALESCE(pp.volatility_score, 50.0) AS risk_rating,
  -- AI RECOMMENDATION (from edge — decision signal)
  CASE
    WHEN v.edge_val >= 13   THEN 'STRONG_BUY'
    WHEN v.edge_val >= 6    THEN 'BUY'
    WHEN v.edge_val <= -9   THEN 'STRONG_SELL'
    WHEN v.edge_val <= -6   THEN 'SELL'
    ELSE 'HOLD'
  END AS ai_recommendation,
  CASE
    WHEN v.edge_val >= 13   THEN 'green'
    WHEN v.edge_val >= 6    THEN 'emerald'
    WHEN v.edge_val <= -9   THEN 'red'
    WHEN v.edge_val <= -6   THEN 'orange'
    ELSE 'amber'
  END AS recommendation_color,
  ROUND(LEAST(100.0, GREATEST(0.0, (v.edge_val + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS recommendation_strength,
  -- MARKET WATCH CATEGORY — from value tiers (pricing inefficiency, not edge)
  CASE
    WHEN v.value_score_v2 >= 15 THEN 'ELITE_VALUE'
    WHEN v.value_score_v2 >= 6  THEN 'GOOD_VALUE'
    WHEN v.value_score_v2 <= -15 THEN 'TRAP'
    WHEN v.value_score_v2 <= -6  THEN 'OVERPRICED'
    ELSE 'FAIR'
  END AS market_watch_category,
  COALESCE(pp.consistency, 50.0) AS consistency,
  CASE
    WHEN COALESCE(pp.matchup_rating, 1.0) >= 1.05 THEN 'Favourable'
    WHEN COALESCE(pp.matchup_rating, 1.0) <= 0.95 THEN 'Tough'
    ELSE 'Neutral'
  END AS matchup_rating,
  true        AS is_available,
  NULL::text  AS status,
  NULL::text  AS manual_status,
  false       AS is_bye,
  NULL::integer AS bye_round,
  false       AS bye_next_round,
  ROUND(v.c_base::numeric, 3),
  ROUND(v.c_form::numeric, 3),
  ROUND(v.c_ceiling::numeric, 3),
  ROUND(v.c_opponent::numeric, 3),
  ROUND(v.c_venue::numeric, 3),
  ROUND(v.c_role::numeric, 3),
  ROUND(v.c_momentum::numeric, 3),
  ROUND(v.c_breakout::numeric, 3),
  ROUND(v.c_risk::numeric, 3),
  NOW() AS cached_at
FROM afl.mv_player_projection pp
JOIN value_computed v ON v.player_id = pp.player_id
WHERE pp.player_id IS NOT NULL;

END;
$function$;

-- Immediately refresh the cache with the new formula
SELECT afl.populate_rankings_cache_from_source();
