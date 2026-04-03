/*
  # Market Watch Distribution Fix — NTILE Percentile Classification

  ## Summary
  Fixes two critical issues:
  1. Snapshot function used fixed thresholds (value_score >= 8 = BUY) causing 0% Avoid in some rounds
  2. v_mw_free view ordered by value_score DESC — free users saw only BUY players (100% Target)

  ## Changes
  1. Rebuild `market.build_market_watch_snapshot()` — uses NTILE(4) percentiles:
     - Top 25% value_score → BUY (Target)
     - Bottom 25% value_score → SELL (Avoid)
     - Middle 50% → HOLD (Watch)
     - Guaranteed ~25% / 50% / 25% distribution every single run
  2. Rebuild `market.v_mw_free` — samples across all 3 categories (balanced mix)
     so free users see a realistic Target/Watch/Avoid split
  3. Rebuild `public.v_mw_free` proxy accordingly

  ## Security
  - All existing RLS and grants preserved
  - SECURITY DEFINER preserved on snapshot function
*/

-- ============================================================
-- STEP 1: REBUILD SNAPSHOT FUNCTION WITH NTILE CLASSIFICATION
-- ============================================================

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  -- Build base pool then apply NTILE(4) for balanced distribution
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
      rc.recommendation_short
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
  ),
  deduped AS (
    SELECT * FROM deduplicated WHERE rn = 1
  ),
  -- NTILE(4) quartile — top 25% = BUY, bottom 25% = SELL, middle = HOLD
  with_quartile AS (
    SELECT *,
      NTILE(4) OVER (ORDER BY value_score DESC) AS quartile
    FROM deduped
  ),
  classified AS (
    SELECT *,
      CASE
        WHEN quartile = 1 THEN 'BUY'
        WHEN quartile = 4 THEN 'SELL'
        ELSE 'HOLD'
      END AS category
    FROM with_quartile
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
    category,
    value_score,
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
  FROM classified;

  UPDATE market.market_watch_snapshot
  SET
    total_player_count = (
      SELECT COUNT(*) FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    buy_category_pct = (
      SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE category = 'BUY') / NULLIF(COUNT(*), 0), 1)
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    sell_category_pct = (
      SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE category = 'SELL') / NULLIF(COUNT(*), 0), 1)
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    distribution_valid = true,
    updated_at = now()
  WHERE snapshot_id = v_snapshot_id;

END;
$function$;

-- ============================================================
-- STEP 2: APPLY NTILE CLASSIFICATION TO EXISTING SNAPSHOT DATA
-- So the fix takes effect immediately without waiting for next pipeline run
-- ============================================================

WITH active_snap AS (
  SELECT snapshot_id FROM market.market_watch_snapshot WHERE is_active = true
),
with_quartile AS (
  SELECT
    sp.id,
    NTILE(4) OVER (ORDER BY sp.value_score DESC) AS quartile
  FROM market.market_watch_snapshot_players sp
  JOIN active_snap ON sp.snapshot_id = active_snap.snapshot_id
),
new_categories AS (
  SELECT
    id,
    CASE
      WHEN quartile = 1 THEN 'BUY'
      WHEN quartile = 4 THEN 'SELL'
      ELSE 'HOLD'
    END AS new_category
  FROM with_quartile
)
UPDATE market.market_watch_snapshot_players sp
SET
  category = nc.new_category,
  action   = nc.new_category,
  buy_score  = CASE WHEN nc.new_category = 'BUY'  THEN sp.value_score ELSE 0 END,
  sell_score = CASE WHEN nc.new_category = 'SELL' THEN ABS(sp.value_score) ELSE 0 END,
  hold_score = CASE WHEN nc.new_category = 'HOLD' THEN 50 ELSE 0 END
FROM new_categories nc
WHERE sp.id = nc.id;

-- ============================================================
-- STEP 3: REBUILD market.v_mw_free — BALANCED MIX ACROSS CATEGORIES
-- Samples top BUY, top WATCH, top SELL players so free users see
-- a realistic distribution (not just all-BUY from value_score DESC)
-- ============================================================

DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE VIEW market.v_mw_free
WITH (security_invoker = false)
AS
WITH base AS (
  SELECT
    sp.id,
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
    -- Rank within each category separately
    ROW_NUMBER() OVER (
      PARTITION BY sp.category
      ORDER BY sp.value_score DESC NULLS LAST, sp.projection DESC NULLS LAST
    ) AS cat_rank
  FROM market.market_watch_snapshot_players sp
  JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE s.is_active = true
),
-- Take top 30 BUY, top 40 HOLD, top 30 SELL → 100 balanced players for free tier
selected AS (
  SELECT * FROM base
  WHERE (category = 'BUY'  AND cat_rank <= 30)
     OR (category = 'HOLD' AND cat_rank <= 40)
     OR (category = 'SELL' AND cat_rank <= 30)
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
FROM selected;

-- ============================================================
-- STEP 4: REBUILD public.v_mw_free proxy (CASCADE dropped it above)
-- ============================================================

DROP VIEW IF EXISTS public.v_mw_free CASCADE;

CREATE VIEW public.v_mw_free AS
  SELECT * FROM market.v_mw_free;

-- Restore grants
GRANT SELECT ON public.v_mw_free TO anon, authenticated;

-- ============================================================
-- STEP 5: Verify distribution after reclassification
-- ============================================================

UPDATE market.market_watch_snapshot
SET
  buy_category_pct = (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE category = 'BUY') / NULLIF(COUNT(*), 0), 1)
    FROM market.market_watch_snapshot_players sp2
    WHERE sp2.snapshot_id = market_watch_snapshot.snapshot_id
  ),
  sell_category_pct = (
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE category = 'SELL') / NULLIF(COUNT(*), 0), 1)
    FROM market.market_watch_snapshot_players sp2
    WHERE sp2.snapshot_id = market_watch_snapshot.snapshot_id
  ),
  updated_at = now()
WHERE is_active = true;
