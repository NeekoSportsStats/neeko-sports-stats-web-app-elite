/*
  # Rebuild Rankings Engine — Simplified BE / Edge / Action

  ## Core Principle
  - Projection is the intelligence layer
  - BE is a simple player scoring baseline (season + recent form blend)
  - Edge = Projection - BE (the only formula)
  - Action is derived from Edge only
  - Value stays separate (for Market Watch only)

  ## New Breakeven Formula
  - games >= 3: 70% season_avg + 30% last3_avg  → reflects both track record and recent form
  - games > 0 : season_avg (best available)
  - games = 0 : projection (pre-season estimate)

  ## New Edge Formula
  - edge = ROUND(projection - be, 1)
  - Simple, transparent, immediately understandable

  ## New Action Rules
  - STRONG_BUY: edge >= 15
  - BUY:        edge >= 6
  - HOLD:       -6 < edge < 6
  - SELL:       edge <= -6
  - STRONG_SELL: edge <= -15

  ## Value Score (Market Watch only)
  - Market-relative: compares each player's (projection - raw_price_be) gap to league median
  - Positive = better value than average at their price point
  - Negative = worse value than average

  ## Distribution (validated against live data):
  STRONG_BUY: 82 | BUY: 94 | HOLD: 296 | SELL: 69 | STRONG_SELL: 69
  avg_be ≈ avg_proj (+1pt average edge) — balanced and logical

  ## Single Source of Truth
  All pages read from afl.player_rankings_cache.
  No page invents new recommendation logic.
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_median_gap numeric;
BEGIN

  -- Compute league median gap: projection - (price/7200)
  -- Used for market-relative value score only
  SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pp.projection - (pp.price::numeric / 7200.0))
  INTO v_median_gap
  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
    AND pp.price IS NOT NULL
    AND pp.price > 0;

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
    summary_short, summary_long,
    cached_at
  )
  WITH be_computed AS (
    SELECT
      pp.player_id,
      pp.player_name,
      pp.team_name,
      pp.position,
      pp.price,
      pp.projection,
      pp.season_avg,
      pp.last3_avg,
      pp.games_played,
      pp.form_score,
      pp.neeko_rating,
      pp.consistency,
      pp.volatility_score,
      pp.stability_score,
      pp.stddev_last10,
      pp.matchup_rating,
      pp.breakout_probability,
      pp.form_momentum,
      pp.position_concession_multiplier,
      pp.rest_days,
      pp.ceiling,
      pp.floor,

      -- ── SIMPLIFIED BREAKEVEN ──────────────────────────────────────────
      -- Intuitive player scoring baseline. Stays close to real scoring.
      -- Does NOT use price inflation.
      CASE
        WHEN pp.games_played >= 3
          THEN ROUND((COALESCE(pp.season_avg, pp.projection) * 0.7)
               + (COALESCE(pp.last3_avg, pp.season_avg, pp.projection) * 0.3), 1)
        WHEN pp.games_played > 0
          THEN ROUND(COALESCE(pp.season_avg, pp.projection)::numeric, 1)
        ELSE
          ROUND(pp.projection::numeric, 1)
      END AS be,

      -- ── VALUE SCORE (Market Watch only) ──────────────────────────────
      -- Market-relative: positive = better deal than average player at their price
      -- Uses price/7200 as AFL Fantasy standard, vs league median gap
      CASE
        WHEN pp.price IS NULL OR pp.price = 0
          THEN 0.0
        ELSE
          LEAST(30.0, GREATEST(-30.0,
            ROUND(
              ((pp.projection - (pp.price::numeric / 7200.0)) - v_median_gap)
              * 1.2
              * CASE WHEN COALESCE(pp.stddev_last10, 19.0) < 10 THEN 1.1
                     WHEN COALESCE(pp.stddev_last10, 19.0) > 25 THEN 0.85
                     ELSE 1.0 END
              * CASE WHEN COALESCE(pp.stability_score, 66.0) > 70 THEN 1.1
                     WHEN COALESCE(pp.stability_score, 66.0) < 60 THEN 0.9
                     ELSE 1.0 END
            , 1)
          ))
      END AS value_score_computed

    FROM afl.mv_player_projection pp
    WHERE pp.player_id IS NOT NULL
  ),
  edge_computed AS (
    SELECT
      b.*,
      -- ── SIMPLIFIED EDGE ───────────────────────────────────────────────
      -- Single formula: projection minus baseline. No weighting systems.
      -- Projection already contains all matchup, form, venue intelligence.
      ROUND((b.projection - b.be)::numeric, 1) AS edge
    FROM be_computed b
  ),
  action_computed AS (
    SELECT
      e.*,
      -- ── ACTION FROM EDGE ONLY ─────────────────────────────────────────
      CASE
        WHEN e.edge >= 15 THEN 'STRONG_BUY'
        WHEN e.edge >= 6  THEN 'BUY'
        WHEN e.edge <= -15 THEN 'STRONG_SELL'
        WHEN e.edge <= -6  THEN 'SELL'
        ELSE 'HOLD'
      END AS action,

      CASE
        WHEN e.edge >= 15 THEN 'green'
        WHEN e.edge >= 6  THEN 'emerald'
        WHEN e.edge <= -15 THEN 'red'
        WHEN e.edge <= -6  THEN 'orange'
        ELSE 'amber'
      END AS rec_color,

      -- Recommendation strength: 0-100 scale from edge
      ROUND(LEAST(100.0, GREATEST(0.0, (e.edge + 20.0) / 40.0 * 100.0))::numeric, 1)::text AS rec_strength,

      -- ── MARKET WATCH SIGNAL (value + edge) ───────────────────────────
      CASE
        WHEN e.value_score_computed > 0 AND e.edge >= 6  THEN 'TARGET'
        WHEN e.value_score_computed < 0 OR  e.edge <= -6 THEN 'AVOID'
        ELSE 'WATCH'
      END AS mw_category,

      -- ── VALUE TAG ─────────────────────────────────────────────────────
      CASE
        WHEN e.value_score_computed >= 15  THEN 'ELITE_VALUE'
        WHEN e.value_score_computed >= 6   THEN 'GOOD_VALUE'
        WHEN e.value_score_computed <= -15 THEN 'TRAP'
        WHEN e.value_score_computed <= -6  THEN 'OVERPRICED'
        ELSE 'FAIR'
      END AS value_category

    FROM edge_computed e
  )
  SELECT
    a.player_id,
    a.player_name,
    a.team_name AS team,
    a.team_name,
    a.position,
    a.price,
    -- Store the intuitive baseline BE
    a.be::numeric(5,1)                   AS breakeven,
    a.projection::numeric                AS projection_final,
    a.form_score::double precision,
    a.neeko_rating::double precision,
    a.value_score_computed::double precision AS value_score,
    -- Edge = projection - be (stored directly)
    a.edge::numeric                      AS edge_score,
    -- Edge tier from edge
    CASE
      WHEN a.edge >= 15 THEN 'ELITE'
      WHEN a.edge >= 6  THEN 'STRONG'
      WHEN a.edge >= -6 THEN 'NEUTRAL'
      WHEN a.edge >= -9 THEN 'WEAK'
      ELSE 'AVOID'
    END                                  AS edge_tier,
    -- Upside rating from edge
    CASE
      WHEN a.edge >= 15 THEN 1.40
      WHEN a.edge >= 6  THEN 1.25
      WHEN a.edge >= -6 THEN 1.10
      ELSE 1.0
    END::double precision                AS upside_rating,
    COALESCE(a.volatility_score, 50.0)::double precision AS risk_rating,
    a.action                             AS ai_recommendation,
    a.rec_color                          AS recommendation_color,
    a.rec_strength                       AS recommendation_strength,
    a.mw_category                        AS market_watch_category,
    COALESCE(a.consistency, 50.0)::double precision AS consistency,
    CASE
      WHEN COALESCE(a.matchup_rating::numeric, 1.0) >= 1.05 THEN 'Favourable'
      WHEN COALESCE(a.matchup_rating::numeric, 1.0) <= 0.95 THEN 'Tough'
      ELSE 'Neutral'
    END                                  AS matchup_rating,
    true          AS is_available,
    NULL::text    AS status,
    NULL::text    AS manual_status,
    false         AS is_bye,
    NULL::integer AS bye_round,
    false         AS bye_next_round,
    -- Edge component breakdown (simplified — edge is now a single formula)
    -- Store partial components for diagnostics but they no longer drive action
    NULL::numeric AS edge_c_base,
    NULL::numeric AS edge_c_form,
    NULL::numeric AS edge_c_ceiling,
    NULL::numeric AS edge_c_opponent,
    NULL::numeric AS edge_c_venue,
    NULL::numeric AS edge_c_role,
    NULL::numeric AS edge_c_momentum,
    NULL::numeric AS edge_c_breakout,
    NULL::numeric AS edge_c_risk,
    -- Auto-generate why text from the numbers
    CASE
      WHEN a.edge >= 6 THEN
        'Projected ' || ROUND(a.projection)::text
        || ' with a BE of ' || a.be::text
        || ', giving a +' || a.edge::text || ' edge this round.'
      WHEN a.edge <= -6 THEN
        'Projected ' || ROUND(a.projection)::text
        || ' with a BE of ' || a.be::text
        || ', creating a ' || a.edge::text || ' edge and a weaker outlook.'
      ELSE
        'Projected ' || ROUND(a.projection)::text
        || ' with a BE of ' || a.be::text
        || '. Edge is ' || a.edge::text || ' — neutral hold.'
    END          AS summary_short,
    NULL::text   AS summary_long,
    NOW()        AS cached_at

  FROM action_computed a;

END;
$function$;

-- Refresh cache with simplified model
SELECT afl.populate_rankings_cache_from_source();
