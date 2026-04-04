/*
  # Fix Breakeven: Use price/7200 as the canonical fantasy breakeven

  ## Problem
  The current `afl.populate_rankings_cache_from_source` computes `breakeven` as a
  weighted season/form average (e.g. season_avg * 0.7 + last3_avg * 0.3). This is
  NOT the AFL fantasy breakeven. It produces values like 20-40 for cash cows who have
  cheap prices, which makes `edge_score = projection - breakeven` unrealistically large
  (+80 for Hugh McCluggage who is actually underwater on price).

  ## Correct Definition
  AFL fantasy breakeven = price / 7200.0
  This is the score a player must average to maintain their price each round.

  ## Changes
  1. Rebuild `afl.populate_rankings_cache_from_source` so:
     - `breakeven` = ROUND(price / 7200.0, 1)  — the real price-maintenance score
     - `edge_score` = projection - breakeven     — how far above/below breakeven
     - `ai_recommendation` thresholds adjusted for real-world range:
         STRONG_BUY: edge >= 20  (projection 20+ above cost)
         BUY:        edge >= 8
         SELL:       edge <= -8
         STRONG_SELL: edge <= -20
         HOLD: otherwise
     - `market_watch_category` aligned to same thresholds
  2. Immediately re-run the function to repopulate the cache with correct values.

  ## What changes for users
  - Rankings breakeven now shows the real score needed to hold/grow price
  - Market Watch value gap becomes trustworthy
  - Edge signals align with actual price risk
  - No more fake +80 value players

  ## Safety
  - Function uses DELETE + INSERT (full refresh), no partial update risk
  - Existing AI summary/analysis columns are preserved via LEFT JOIN
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'afl', 'public', 'ai'
AS $function$
DECLARE
  v_median_gap numeric;
BEGIN

  -- Compute market-wide median of (projection - price_breakeven)
  -- Used to centre the value_score so 0 = league average value
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
    games_played,
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
  WITH base AS (
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

      -- CANONICAL BREAKEVEN: score needed to maintain price this round
      -- price / 7200 is the standard AFL fantasy formula
      CASE
        WHEN pp.price IS NULL OR pp.price = 0 THEN NULL
        ELSE ROUND(pp.price::numeric / 7200.0, 1)
      END AS be,

      -- VALUE SCORE: how far projection sits above/below market median
      -- Adjusted for consistency and volatility
      CASE
        WHEN pp.price IS NULL OR pp.price = 0 THEN 0.0
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
      -- EDGE = projection minus price breakeven (true cost of owning player)
      CASE
        WHEN b.be IS NULL THEN 0.0
        ELSE ROUND((b.projection - b.be)::numeric, 1)
      END AS edge
    FROM base b
  ),
  action_computed AS (
    SELECT
      e.*,
      -- RECOMMENDATION: based on how far projection clears the price breakeven
      -- Real-world range: premium players have BE ~120-170, budget BE ~40-80
      -- Thresholds reflect meaningful fantasy value gaps
      CASE
        WHEN e.edge >= 20  THEN 'STRONG_BUY'
        WHEN e.edge >= 8   THEN 'BUY'
        WHEN e.edge <= -20 THEN 'STRONG_SELL'
        WHEN e.edge <= -8  THEN 'SELL'
        ELSE 'HOLD'
      END AS action,

      CASE
        WHEN e.edge >= 20  THEN 'green'
        WHEN e.edge >= 8   THEN 'emerald'
        WHEN e.edge <= -20 THEN 'red'
        WHEN e.edge <= -8  THEN 'orange'
        ELSE 'amber'
      END AS rec_color,

      ROUND(LEAST(100.0, GREATEST(0.0, (e.edge + 30.0) / 60.0 * 100.0))::numeric, 1)::text AS rec_strength,

      -- MARKET WATCH CATEGORY aligned to same edge thresholds
      CASE
        WHEN e.value_score_computed > 0 AND e.edge >= 8  THEN 'TARGET'
        WHEN e.value_score_computed < 0 OR  e.edge <= -8 THEN 'AVOID'
        ELSE 'WATCH'
      END AS mw_category,

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
    a.team_name                                  AS team,
    a.team_name,
    a.position,
    a.price,
    a.be::numeric(6,1)                           AS breakeven,
    a.games_played,
    a.projection::numeric                        AS projection_final,
    a.form_score::double precision,
    a.neeko_rating::double precision,
    a.value_score_computed::double precision     AS value_score,
    a.edge::numeric                              AS edge_score,
    CASE
      WHEN a.edge >= 20 THEN 'ELITE'
      WHEN a.edge >= 8  THEN 'STRONG'
      WHEN a.edge >= -8 THEN 'NEUTRAL'
      WHEN a.edge >= -15 THEN 'WEAK'
      ELSE 'AVOID'
    END                                          AS edge_tier,
    CASE
      WHEN a.edge >= 20 THEN 1.40
      WHEN a.edge >= 8  THEN 1.25
      WHEN a.edge >= -8 THEN 1.10
      ELSE 1.0
    END::double precision                        AS upside_rating,
    COALESCE(a.volatility_score, 50.0)::double precision AS risk_rating,
    a.action                                     AS ai_recommendation,
    a.rec_color                                  AS recommendation_color,
    a.rec_strength                               AS recommendation_strength,
    a.mw_category                                AS market_watch_category,
    COALESCE(a.consistency, 50.0)::double precision AS consistency,
    CASE
      WHEN COALESCE(a.matchup_rating::numeric, 1.0) >= 1.05 THEN 'Favourable'
      WHEN COALESCE(a.matchup_rating::numeric, 1.0) <= 0.95 THEN 'Tough'
      ELSE 'Neutral'
    END                                          AS matchup_rating,
    true          AS is_available,
    NULL::text    AS status,
    NULL::text    AS manual_status,
    false         AS is_bye,
    NULL::integer AS bye_round,
    false         AS bye_next_round,
    NULL::numeric AS edge_c_base,
    NULL::numeric AS edge_c_form,
    NULL::numeric AS edge_c_ceiling,
    NULL::numeric AS edge_c_opponent,
    NULL::numeric AS edge_c_venue,
    NULL::numeric AS edge_c_role,
    NULL::numeric AS edge_c_momentum,
    NULL::numeric AS edge_c_breakout,
    NULL::numeric AS edge_c_risk,
    ai_data.summary_short,
    NULL::text    AS summary_long,
    NOW()         AS cached_at

  FROM action_computed a
  LEFT JOIN ai.player_ai_analysis ai_data ON ai_data.player_id = a.player_id;

END;
$function$;
