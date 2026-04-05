/*
  # Scoring System Rebuild — Step 2: Rewrite populate_rankings_cache

  Single source of truth rebuild.

  CORE LOGIC:
  1. breakeven = COALESCE(last5_avg, last3_avg, season_avg, projection_final)
  2. edge = projection_final - breakeven
  3. value_score = edge / (price / 100000)  [edge points per $100k]
  4. signal = percentile-based 5-tier (p15/p35/p65/p85 of edge)
  5. category = deterministic from signal: STRONG_UP|UP→Target, STABLE→Watch, DOWN|STRONG_DOWN→Avoid
  6. action = deterministic from signal: STRONG_UP|UP→BUY, STABLE→HOLD, DOWN|STRONG_DOWN→SELL

  QUALITY FILTER for signal computation: games_played >= 3 AND projection_final >= 50
  The full cache still includes all players; canonical columns are populated for all
  but signal logic is most meaningful for quality-filtered players.

  NO AI override of category/action — AI explains only.
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_snapshot_id text;
  v_p15 numeric;
  v_p35 numeric;
  v_p65 numeric;
  v_p85 numeric;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

  -- Compute edge percentile thresholds from quality players only
  -- edge = projection_final - COALESCE(last5_avg, last3_avg, season_avg, projection_final)
  SELECT
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.65) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)))
  INTO v_p15, v_p35, v_p65, v_p85
  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
    AND pp.player_name IS NOT NULL
    AND pp.games_played >= 3
    AND pp.projection >= 50
    AND pp.price > 0
    AND COALESCE((
      SELECT ap.manual_status FROM afl.afl_players ap WHERE ap.player_id = pp.player_id
    ), 'active') != 'delisted';

  -- Safety fallbacks if percentiles are null
  v_p15 := COALESCE(v_p15, -15);
  v_p35 := COALESCE(v_p35, -5);
  v_p65 := COALESCE(v_p65,  5);
  v_p85 := COALESCE(v_p85, 15);

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor,
    ceiling_estimate, floor_estimate,
    consistency, form_score,
    neeko_rating, neeko_rating_scaled, neeko_rating_raw,
    price, prev_price, price_change, price_change_pct,
    value_score, value_tag, value_tier, best_value_score,
    signal, signal_tag,
    matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, upside_pct,
    baseline, trend_score, trend_signal, value_signal,
    season_avg, last_3_avg, last_5_avg,
    edge, edge_c_base, edge_c_form, edge_c_ceiling,
    edge_c_opponent, edge_c_venue, edge_c_role,
    edge_c_momentum, edge_c_breakout, edge_c_risk,
    captain_score, captain_rating,
    projection_confidence, risk_rating,
    breakeven, games_played,
    bye_round, is_bye, bye_next_round, team_id,
    status, manual_status, is_available,
    ai_summary, ai_updated_at, ai_generated_at,
    ai_prompt_version, ai_validation_passed,
    summary, analysis, recommendation_color,
    recommendation_short, recommendation_why, recommendation_strength,
    summary_short, summary_long,
    start_sit_decision, confidence_label,
    market_watch_category, consistency_tier,
    cache_snapshot_id, cached_at,
    -- NEW CANONICAL COLUMNS
    breakeven_canonical, edge_canonical, value_score_canonical,
    signal_canonical, category_canonical, action_canonical,
    value
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team,
    pp.team                                                AS team_name,
    pp.position,
    pp.position                                            AS position_group,
    pp.projection                                          AS projection_final,
    pp.projection,
    pp.ceiling,
    pp.floor,
    pp.ceiling                                             AS ceiling_estimate,
    pp.floor                                               AS floor_estimate,
    pp.consistency_score                                   AS consistency,
    pp.form_score,
    pp.neeko_rating,
    pp.neeko_rating                                        AS neeko_rating_scaled,
    pp.neeko_rating                                        AS neeko_rating_raw,
    pp.price,
    pp.prev_price,
    pp.price - pp.prev_price                               AS price_change,
    CASE WHEN pp.prev_price > 0
      THEN ROUND(((pp.price - pp.prev_price) / pp.prev_price * 100)::numeric, 1)
      ELSE NULL
    END                                                    AS price_change_pct,
    pp.value_score,
    pp.value_tag,
    pp.value_tier,
    pp.value_score                                         AS best_value_score,
    -- canonical signal (also write to legacy signal column for compat)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END                                                    AS signal,
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END                                                    AS signal_tag,
    pp.matchup_label                                       AS matchup_rating,
    pp.matchup_label,
    pp.matchup_multiplier,
    pp.upside_rating,
    pp.upside_pct,
    pp.baseline,
    pp.trend_score,
    CASE
      WHEN pp.trend_score >= 12  THEN 'STRONG_UP'
      WHEN pp.trend_score >= 5   THEN 'UP'
      WHEN pp.trend_score >= -3  THEN 'STABLE'
      WHEN pp.trend_score >= -10 THEN 'DOWN'
      ELSE                            'STRONG_DOWN'
    END                                                    AS trend_signal,
    pp.value_signal,
    pp.season_avg,
    pp.last3_avg                                           AS last_3_avg,
    pp.last5_avg                                           AS last_5_avg,
    pp.edge,
    pp.edge_c_base,
    pp.edge_c_form,
    pp.edge_c_ceiling,
    pp.edge_c_opponent,
    pp.edge_c_venue,
    pp.edge_c_role,
    pp.edge_c_momentum,
    pp.edge_c_breakout,
    pp.edge_c_risk,
    pp.captain_score,
    pp.captain_rating,
    pp.projection_confidence,
    pp.risk_rating,
    -- canonical breakeven
    COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection) AS breakeven,
    pp.games_played,
    pp.bye_round,
    pp.is_bye,
    pp.bye_next_round,
    pp.team_id,
    COALESCE(ap.manual_status, 'active')                   AS status,
    ap.manual_status,
    CASE WHEN COALESCE(ap.manual_status, 'active') IN ('active','questionable') THEN true ELSE false END AS is_available,
    pa.ai_summary,
    pa.ai_updated_at,
    pa.generated_at                                        AS ai_generated_at,
    pa.prompt_version                                      AS ai_prompt_version,
    pa.validation_passed                                   AS ai_validation_passed,
    pa.summary,
    pa.analysis,
    pa.recommendation_color,
    pa.recommendation_short,
    pa.recommendation_why,
    pa.recommendation_strength,
    pa.summary_short,
    pa.summary_long,
    pa.start_sit_decision,
    pa.confidence_label,
    -- market_watch_category now derived from signal, not AI
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'Watch'
      ELSE 'Avoid'
    END                                                    AS market_watch_category,
    pa.consistency_tier,
    v_snapshot_id                                          AS cache_snapshot_id,
    now()                                                  AS cached_at,

    -- CANONICAL BREAKEVEN
    COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection) AS breakeven_canonical,

    -- CANONICAL EDGE
    (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) AS edge_canonical,

    -- CANONICAL VALUE SCORE: edge per $100k of price
    CASE WHEN pp.price > 0
      THEN ROUND(
        ((pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
          / (pp.price::numeric / 100000.0))::numeric,
        3
      )
      ELSE 0
    END                                                    AS value_score_canonical,

    -- CANONICAL SIGNAL (same logic as above, stored for direct read)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END                                                    AS signal_canonical,

    -- CANONICAL CATEGORY (deterministic from signal)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'Watch'
      ELSE 'Avoid'
    END                                                    AS category_canonical,

    -- CANONICAL ACTION (deterministic from signal)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'BUY'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'HOLD'
      ELSE 'SELL'
    END                                                    AS action_canonical,

    -- value column (canonical value score for compat)
    CASE WHEN pp.price > 0
      THEN ROUND(
        ((pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
          / (pp.price::numeric / 100000.0))::numeric,
        3
      )
      ELSE 0
    END                                                    AS value

  FROM afl.mv_player_projection pp
  LEFT JOIN afl.afl_players ap ON ap.player_id = pp.player_id
  LEFT JOIN afl.player_ai_analysis pa ON pa.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL
    AND pp.player_name IS NOT NULL
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'populate_rankings_cache error: %', SQLERRM;
END;
$function$;
