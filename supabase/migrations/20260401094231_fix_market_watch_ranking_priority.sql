/*
  # Fix Market Watch Ranking Priority

  ## Problem
  Current Market Watch sorting shows rookie noise at top:
  - Low-price rookies with inflated value_gap dominate
  - Neutral players (WATCH) mixed with real targets
  - No quality filter for realistic trade targets

  ## Solution
  1. Add minimum quality filter (projection >= 75)
  2. Create priority_score combining value, projection, and strength
  3. Apply rookie penalty for price < 400k
  4. Sort by priority_score instead of raw value_gap
  5. Ensure TARGET > WATCH > AVOID in rankings

  ## Priority Score Formula

  priority_score =
    value_score
    + (projection * 0.3)
    + (recommendation_strength * 5)
    - rookie_penalty

  Where:
  - value_score = base value gap metric
  - projection weight = 0.3 (30% influence)
  - recommendation_strength = 0-10 scale from ai_recommendation
  - rookie_penalty = -20 if price < 400k, else 0

  ## Expected Result
  Top players should be:
  ✅ High projection (80-120 range)
  ✅ Strong value (positive gap)
  ✅ Real trade targets (not rookies)
  ✅ TARGET signals dominate top 10
*/

-- Drop and rebuild the snapshot function with priority scoring
DROP FUNCTION IF EXISTS market.build_market_watch_snapshot();

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'afl', 'public'
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(week) INTO v_season, v_round
  FROM afl.player_games GROUP BY season ORDER BY season DESC LIMIT 1;

  IF v_season IS NULL THEN v_season := 2026; v_round  := 1; END IF;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
  SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id;

  WITH source_data AS (
    SELECT
      rc.player_id,
      rc.player_name,
      rc.team,
      rc.position,
      COALESCE(rc.price, 0) as price,
      COALESCE(rc.prev_price, rc.price, 0) as prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric as price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric as projection,

      CASE
        WHEN mv.season_avg IS NOT NULL AND mv.season_avg BETWEEN 40 AND 150
          THEN mv.season_avg::numeric
        WHEN mv.last3_avg IS NOT NULL AND mv.last3_avg BETWEEN 40 AND 150
          THEN mv.last3_avg::numeric
        ELSE GREATEST(40, LEAST(150, COALESCE(rc.projection_final, rc.projection, 70)::numeric))
      END as breakeven,

      COALESCE(rc.value_score, 0)::numeric as value_score,

      CASE
        WHEN rc.value_score >= 15  THEN 'Elite Value'
        WHEN rc.value_score >= 8   THEN 'Strong Value'
        WHEN rc.value_score >= 2   THEN 'Solid Value'
        WHEN rc.value_score >= -3  THEN 'Fair Price'
        WHEN rc.value_score >= -8  THEN 'Slight Premium'
        ELSE 'Overpriced'
      END as value_label,

      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'TARGET'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'AVOID'
        ELSE 'WATCH'
      END as action_label,

      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'buy'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'sell'
        ELSE 'hold'
      END as category,

      rc.ai_recommendation,
      rc.recommendation_short,
      rc.summary_short,
      rc.summary_long,

      COALESCE(rc.ceiling, rc.projection_final, rc.projection, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,

      -- Recommendation strength (0-10 scale)
      CASE rc.ai_recommendation
        WHEN 'STRONG_BUY' THEN 10
        WHEN 'BUY' THEN 8
        WHEN 'HOLD' THEN 5
        WHEN 'SELL' THEN 3
        WHEN 'AVOID' THEN 1
        ELSE 5
      END as recommendation_strength,

      -- Rookie penalty (high penalty for cheap players to reduce noise)
      CASE
        WHEN COALESCE(rc.price, 0) < 400000 THEN 20
        ELSE 0
      END as rookie_penalty,

      -- Category priority for grouping
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation = 'HOLD' THEN 2
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 3
        ELSE 4
      END as category_priority

    FROM afl.player_rankings_cache rc
    LEFT JOIN afl.mv_player_projection mv ON mv.player_id = rc.player_id
    WHERE rc.player_id IS NOT NULL
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) >= 75
      AND COALESCE(rc.is_bye, false) = false
      AND (rc.manual_status IS NULL OR rc.manual_status <> 'OUT')
      AND rc.ai_recommendation IS NOT NULL
  ),
  scored_data AS (
    SELECT
      *,
      ROUND(
        value_score
        + (projection * 0.3)
        + (recommendation_strength * 5)
        - rookie_penalty
      , 1) as priority_score
    FROM source_data
  ),
  deduplicated AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY priority_score DESC) as rn
    FROM scored_data
  )
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, prev_price, price_change_pct,
    projection, breakeven, ceiling,
    risk_pct, price_edge_pts,
    category, action,
    trade_score, reasons,
    value_score,
    expected_price_change, projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status, buy_score, sell_score, hold_score, watch_score
  )
  SELECT
    v_snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    prev_price::integer,
    price_change_pct,
    projection,
    breakeven,
    ceiling,
    risk_pct,
    value_score as price_edge_pts,
    category,
    action_label as action,
    priority_score as trade_score,
    to_jsonb(ARRAY[ai_recommendation, recommendation_short]) as reasons,
    value_score,
    0, price::numeric, price::numeric, price::numeric, price::numeric,
    0, false, risk_pct, 'Medium',
    projection, price::numeric, price::numeric, price::numeric, 0, 'Stable',
    price::numeric, 0, 'current', 0, 0, 0, 0
  FROM deduplicated
  WHERE rn = 1
  ORDER BY
    category_priority ASC,
    priority_score DESC NULLS LAST;

  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'TARGET') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'AVOID') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
END;
$$;

DROP VIEW IF EXISTS market.v_mw_premium CASCADE;

CREATE OR REPLACE VIEW market.v_mw_premium
WITH (security_invoker=off)
AS
SELECT
  sp.snapshot_id,
  sp.player_id,
  sp.player_name,
  sp.team,
  sp.position,
  sp.price,
  sp.breakeven,
  sp.projection,
  sp.ceiling,
  sp.risk_pct,
  sp.price_edge_pts,
  sp.expected_price_change,
  sp.projected_price,
  sp.projected_price_r1,
  sp.projected_price_r2,
  sp.projected_price_r3,
  sp.breakout_score,
  sp.breakout_flag,
  sp.volatility_score,
  sp.volatility_level,
  sp.category,
  sp.action,
  sp.trade_score,
  sp.reasons,
  sp.last3_avg,
  sp.estimated_price,
  sp.value_score,
  sp.value_label,
  sp.price_range_top,
  sp.price_range_bottom,
  sp.value_momentum,
  sp.momentum_label,
  sp.peak_price,
  sp.peak_round,
  sp.peak_status,
  sp.buy_score,
  sp.sell_score,
  sp.hold_score,
  sp.watch_score,
  sp.prev_price,
  sp.price_change_pct,
  rc.ai_recommendation,
  rc.recommendation_short,
  rc.summary_short,
  rc.summary_long,
  rc.matchup_label,
  rc.consistency,
  rc.projection_confidence,
  rc.neeko_rating,
  s.updated_at as snapshot_updated_at
FROM market.market_watch_snapshot_players sp
INNER JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
WHERE s.is_active = true
ORDER BY
  CASE sp.action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
  END,
  sp.trade_score DESC NULLS LAST;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;

DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE OR REPLACE VIEW market.v_mw_free
WITH (security_invoker=off)
AS
WITH ranked_players AS (
  SELECT
    sp.*,
    rc.ai_recommendation,
    rc.recommendation_short,
    rc.summary_short,
    rc.summary_long,
    rc.matchup_label,
    rc.consistency,
    rc.projection_confidence,
    rc.neeko_rating,
    s.updated_at as snapshot_updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY sp.action
      ORDER BY sp.trade_score DESC
    ) as rank_in_category
  FROM market.market_watch_snapshot_players sp
  INNER JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE s.is_active = true
)
SELECT
  snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection,
  ceiling,
  risk_pct,
  price_edge_pts,
  expected_price_change,
  projected_price,
  projected_price_r1,
  projected_price_r2,
  projected_price_r3,
  breakout_score,
  breakout_flag,
  volatility_score,
  volatility_level,
  category,
  action,
  trade_score,
  reasons,
  last3_avg,
  estimated_price,
  value_score,
  value_label,
  price_range_top,
  price_range_bottom,
  value_momentum,
  momentum_label,
  peak_price,
  peak_round,
  peak_status,
  buy_score,
  sell_score,
  hold_score,
  watch_score,
  prev_price,
  price_change_pct,
  ai_recommendation,
  recommendation_short,
  summary_short,
  summary_long,
  matchup_label,
  consistency,
  projection_confidence,
  neeko_rating,
  snapshot_updated_at
FROM ranked_players
WHERE rank_in_category <= 3
ORDER BY
  CASE action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
  END,
  rank_in_category;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;

SELECT market.build_market_watch_snapshot();

COMMENT ON FUNCTION market.build_market_watch_snapshot IS
'Market Watch snapshot builder with PRIORITY SCORING.
Filters: projection >= 75 (quality threshold)
Scoring: value_score + (projection * 0.3) + (strength * 5) - rookie_penalty
Penalty: -20 for price < 400k (reduces rookie noise)
Result: Real trade targets at top, not cheap rookies';
