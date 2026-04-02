/*
  # Market Watch — Value Score Classification Overhaul

  ## Summary
  Rebuilds the Market Watch classification system to use value_score thresholds
  instead of ai_recommendation field. Fixes distribution to be realistic
  (BUY ~10-15%, HOLD ~60-70%, SELL ~15-25%) and removes category-grouped sorting
  in favour of a single globally sorted list by value_score DESC.

  ## Changes

  ### 1. Rebuild market.build_market_watch_snapshot()
  - Classification: BUY if value_score >= 8, HOLD if -4.5 to <8, SELL if <= -4.5
  - Elite BUY boost: projection >= 90 AND value_score >= 3 → force BUY
  - Hard block: value_score < 0 → CANNOT be BUY (forced to HOLD/SELL)
  - Removes rigid top-100-per-category cap
  - trade_score (sort key) = value_score so ORDER BY trade_score = ORDER BY value_score

  ### 2. Rebuild market.v_mw_premium
  - ORDER BY value_score DESC, projection DESC globally (no category partitioning)

  ### 3. Rebuild market.v_mw_free
  - ORDER BY value_score DESC in ranked CTE so top 100 = highest value players
*/

-- ============================================================
-- 1. REBUILD build_market_watch_snapshot()
-- ============================================================
CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(week) INTO v_season, v_round
  FROM afl.player_games GROUP BY season ORDER BY season DESC LIMIT 1;

  IF v_season IS NULL THEN v_season := 2026; v_round := 1; END IF;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
  SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id;

  WITH base_players AS (
    SELECT
      rc.player_id,
      rc.player_name,
      rc.team,
      rc.position,
      COALESCE(rc.price, 0)                                    AS price,
      COALESCE(rc.prev_price, rc.price, 0)                     AS prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric                AS price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric AS projection,
      GREATEST(0, ROUND((COALESCE(rc.price, 0)::numeric / 7200.0))) AS breakeven,
      COALESCE(rc.ceiling, rc.projection_final, 0)::numeric    AS ceiling,
      COALESCE(rc.risk_rating, 50)::numeric                    AS risk_pct,
      COALESCE(rc.value_score, 0)::numeric                     AS value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric                   AS neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric          AS projection_confidence,
      rc.recommendation_short,
      -- Classification using value_score thresholds
      -- Hard block: value_score < 0 CANNOT be BUY
      -- Elite boost: projection >= 90 AND value_score >= 3 → BUY
      CASE
        WHEN COALESCE(rc.value_score, 0) < 0              THEN
          CASE WHEN COALESCE(rc.value_score, 0) <= -4.5 THEN 'SELL' ELSE 'HOLD' END
        WHEN COALESCE(rc.value_score, 0) >= 8             THEN 'BUY'
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 90
         AND COALESCE(rc.value_score, 0) >= 3             THEN 'BUY'
        WHEN COALESCE(rc.value_score, 0) <= -4.5          THEN 'SELL'
        ELSE 'HOLD'
      END AS category,
      -- trade_score = value_score so ORDER BY trade_score gives natural value order
      COALESCE(rc.value_score, 0)::numeric AS trade_score
    FROM afl.player_rankings_cache rc
    LEFT JOIN afl.players p ON p.player_id = rc.player_id
    WHERE
      rc.player_id IS NOT NULL
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      AND rc.status = 'active'
      AND rc.is_available = true
      AND COALESCE(rc.is_bye, false) = false
      AND COALESCE(p.active, true) = true
      AND (rc.manual_status IS NULL OR rc.manual_status NOT IN ('RETIRED', 'injured', 'out', 'suspended'))
      AND COALESCE(rc.price, 0) >= 300000
  ),
  deduplicated AS (
    SELECT *,
    ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY value_score DESC) AS rn
    FROM base_players
  )
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position, price, prev_price, price_change_pct,
    projection, breakeven, ceiling, risk_pct, price_edge_pts, expected_price_change,
    category, action, trade_score, reasons, projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score, price_range_top, price_range_bottom, value_momentum, momentum_label,
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
    breakeven::integer,
    ceiling,
    risk_pct,
    0,
    0,
    category,
    category,  -- action = category
    trade_score,
    jsonb_build_array(COALESCE(recommendation_short, 'No analysis'))::jsonb,
    price,
    price,
    price,
    price,
    0,
    false,
    risk_pct,
    CASE WHEN risk_pct >= 70 THEN 'High' WHEN risk_pct >= 40 THEN 'Medium' ELSE 'Low' END,
    projection,
    price,
    value_score,
    ceiling,
    GREATEST(projection * 0.8, breakeven * 7200),
    0,
    'Stable',
    price,
    v_round,
    'Current',
    CASE WHEN category = 'BUY'  THEN value_score ELSE 0 END,
    CASE WHEN category = 'SELL' THEN ABS(value_score) ELSE 0 END,
    CASE WHEN category = 'HOLD' THEN 50 ELSE 0 END,
    value_score
  FROM deduplicated
  WHERE rn = 1;

END;
$$;

-- ============================================================
-- 2. REBUILD market.v_mw_premium — ORDER BY value_score DESC globally
-- ============================================================
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;

CREATE VIEW market.v_mw_premium AS
SELECT
  sp.snapshot_id,
  sp.player_id,
  sp.player_name,
  sp.team,
  sp."position",
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
  s.updated_at AS snapshot_updated_at
FROM market.market_watch_snapshot_players sp
JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
WHERE s.is_active = true
ORDER BY sp.value_score DESC NULLS LAST, sp.projection DESC NULLS LAST;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;

-- ============================================================
-- 3. REBUILD market.v_mw_free — ORDER BY value_score DESC, top 100 = highest value
-- ============================================================
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE VIEW market.v_mw_free AS
WITH ranked AS (
  SELECT
    sp.id,
    sp.snapshot_id,
    sp.player_id,
    sp.player_name,
    sp.team,
    sp."position",
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
    sp.created_at,
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
    s.updated_at AS snapshot_updated_at,
    ROW_NUMBER() OVER (ORDER BY sp.value_score DESC NULLS LAST, sp.projection DESC NULLS LAST) AS overall_rank
  FROM market.market_watch_snapshot_players sp
  JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE s.is_active = true
)
SELECT
  snapshot_id,
  player_id,
  player_name,
  team,
  "position",
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
FROM ranked
WHERE overall_rank <= 100;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;

-- ============================================================
-- 4. Re-run snapshot to populate with new classification
-- ============================================================
SELECT market.build_market_watch_snapshot();
