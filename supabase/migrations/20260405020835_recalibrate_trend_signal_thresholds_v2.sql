/*
  # Recalibrate Trend Signal Thresholds v2

  ## Problem
  Old thresholds (STRONG_UP ≥18, UP ≥8, STABLE ≥-5) clustered 53% of players
  into STABLE because most AFL players sit in the +0 to +8 trend_score range.
  Result: ACTION column showed HOLD for the majority of players.

  ## New Thresholds
  - STRONG_UP: trend_score >= 12
  - UP:        trend_score >= 5
  - STABLE:    trend_score >= -3
  - DOWN:      trend_score >= -10
  - STRONG_DOWN: else

  ## Expected Distribution
  - STRONG_UP:   ~16%
  - UP:          ~17%
  - STABLE:      ~41%
  - DOWN:        ~11%
  - STRONG_DOWN: ~15%

  ## Changes
  1. Rebuild populate_rankings_cache to use new thresholds
  2. Immediate backfill of afl.player_rankings_cache with new trend_signal values
*/

-- ─── Step 1: Backfill trend_signal in afl.player_rankings_cache using new thresholds ─
UPDATE afl.player_rankings_cache
SET trend_signal = CASE
  WHEN trend_score >= 12  THEN 'STRONG_UP'
  WHEN trend_score >= 5   THEN 'UP'
  WHEN trend_score >= -3  THEN 'STABLE'
  WHEN trend_score >= -10 THEN 'DOWN'
  ELSE 'STRONG_DOWN'
END
WHERE trend_score IS NOT NULL;

-- ─── Step 2: Replace the populate_rankings_cache function with new thresholds ─────
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_snapshot_id text;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

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
    cache_snapshot_id, cached_at
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
         ELSE NULL END                                     AS price_change_pct,
    pp.value_score,
    pp.value_tag,
    pp.value_tier,
    pp.value_score                                         AS best_value_score,
    pp.signal,
    pp.signal_tag,
    pp.matchup_label                                       AS matchup_rating,
    pp.matchup_label,
    pp.matchup_multiplier,
    pp.upside_rating,
    pp.upside_pct,
    pp.baseline,
    pp.trend_score,
    -- NEW THRESHOLDS v2
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
    pp.breakeven,
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
    pa.market_watch_category,
    pa.consistency_tier,
    v_snapshot_id                                          AS cache_snapshot_id,
    now()                                                  AS cached_at
  FROM afl.mv_player_projection pp
  LEFT JOIN afl.afl_players ap ON ap.player_id = pp.player_id
  LEFT JOIN afl.player_ai_analysis pa ON pa.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL
    AND pp.player_name IS NOT NULL
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'populate_rankings_cache error: %', SQLERRM;
END;
$$;
