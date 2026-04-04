/*
  # Expose signal_tag in Market Watch views

  ## Summary
  Rebuilds market.v_mw_premium, market.v_mw_free, public.v_mw_premium, public.v_mw_free
  to expose signal_tag from afl.player_rankings_cache.

  signal_tag is the single source of truth — all UI pages use it for badges and filters.
*/

-- Drop public proxy views first (depend on market views)
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;
DROP VIEW IF EXISTS public.v_mw_free CASCADE;
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

-- ============================================================
-- market.v_mw_premium — full data, includes signal_tag
-- ============================================================
CREATE VIEW market.v_mw_premium AS
SELECT
  gen_random_uuid()::text        AS snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection_final               AS projection,
  ceiling,
  floor                          AS floor_val,
  risk_rating                    AS risk_pct,
  ROUND(projection_final - breakeven, 2) AS value_gap,
  -- signal_tag is the canonical UI field
  signal_tag,
  -- category/action kept for backwards compat but both derived from signal_tag
  CASE
    WHEN signal_tag = 'TARGET' THEN 'BUY'
    WHEN signal_tag = 'AVOID'  THEN 'SELL'
    ELSE 'HOLD'
  END                            AS category,
  CASE
    WHEN signal_tag = 'TARGET' THEN 'BUY'
    WHEN signal_tag = 'AVOID'  THEN 'SELL'
    ELSE 'HOLD'
  END                            AS action,
  ai_recommendation,
  recommendation_short,
  summary_short,
  summary_long,
  matchup_label,
  prev_price,
  price_change,
  consistency,
  projection_confidence,
  neeko_rating,
  status,
  manual_status,
  is_bye,
  false                          AS is_injured,
  COALESCE(cached_at, now())    AS snapshot_updated_at,
  2026                           AS season,
  1                              AS round_number
FROM afl.player_rankings_cache rc
WHERE is_available = true
  AND projection_final IS NOT NULL
  AND projection_final > 0
  AND price IS NOT NULL
  AND price > 0
  AND (is_bye IS NULL OR is_bye = false)
  AND ai_recommendation IS NOT NULL
ORDER BY
  CASE signal_tag
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH'  THEN 2
    WHEN 'AVOID'  THEN 3
    ELSE 4
  END,
  (projection_final - breakeven) DESC NULLS LAST
LIMIT 300;

-- ============================================================
-- market.v_mw_free — capped pool, includes signal_tag
-- ============================================================
CREATE VIEW market.v_mw_free AS
WITH base AS (
  SELECT
    gen_random_uuid()::text        AS snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    rc.breakeven,
    rc.projection_final            AS projection,
    rc.ceiling,
    rc.floor                       AS floor_val,
    rc.risk_rating                 AS risk_pct,
    ROUND(rc.projection_final - rc.breakeven, 2) AS value_gap,
    rc.signal_tag,
    CASE
      WHEN rc.signal_tag = 'TARGET' THEN 'BUY'
      WHEN rc.signal_tag = 'AVOID'  THEN 'SELL'
      ELSE 'HOLD'
    END                            AS category,
    CASE
      WHEN rc.signal_tag = 'TARGET' THEN 'BUY'
      WHEN rc.signal_tag = 'AVOID'  THEN 'SELL'
      ELSE 'HOLD'
    END                            AS action,
    rc.ai_recommendation,
    rc.recommendation_short,
    rc.summary_short,
    rc.summary_long,
    rc.matchup_label,
    rc.prev_price,
    rc.price_change,
    rc.consistency,
    rc.projection_confidence,
    rc.neeko_rating,
    rc.status,
    rc.manual_status,
    rc.is_bye,
    false                          AS is_injured,
    COALESCE(rc.cached_at, now()) AS snapshot_updated_at,
    2026                           AS season,
    1                              AS round_number
  FROM afl.player_rankings_cache rc
  WHERE rc.is_available = true
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final > 0
    AND rc.price IS NOT NULL
    AND rc.price > 0
    AND (rc.is_bye IS NULL OR rc.is_bye = false)
    AND rc.ai_recommendation IS NOT NULL
),
targets AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap DESC) AS rn
  FROM base WHERE signal_tag = 'TARGET'
),
watches AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap DESC) AS rn
  FROM base WHERE signal_tag = 'WATCH'
),
avoids AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap ASC) AS rn
  FROM base WHERE signal_tag = 'AVOID'
),
combined AS (
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap, signal_tag,
         category, action, ai_recommendation, recommendation_short,
         summary_short, summary_long, matchup_label, prev_price, price_change,
         consistency, projection_confidence, neeko_rating, status, manual_status,
         is_bye, is_injured, snapshot_updated_at, season, round_number
  FROM targets WHERE rn <= 30
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap, signal_tag,
         category, action, ai_recommendation, recommendation_short,
         summary_short, summary_long, matchup_label, prev_price, price_change,
         consistency, projection_confidence, neeko_rating, status, manual_status,
         is_bye, is_injured, snapshot_updated_at, season, round_number
  FROM watches WHERE rn <= 40
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap, signal_tag,
         category, action, ai_recommendation, recommendation_short,
         summary_short, summary_long, matchup_label, prev_price, price_change,
         consistency, projection_confidence, neeko_rating, status, manual_status,
         is_bye, is_injured, snapshot_updated_at, season, round_number
  FROM avoids WHERE rn <= 30
)
SELECT * FROM combined
ORDER BY value_gap DESC NULLS LAST, projection DESC NULLS LAST;

-- ============================================================
-- Rebuild public proxy views
-- ============================================================
CREATE VIEW public.v_mw_premium AS SELECT * FROM market.v_mw_premium;
CREATE VIEW public.v_mw_free    AS SELECT * FROM market.v_mw_free;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;
GRANT SELECT ON public.v_mw_free    TO anon, authenticated;
GRANT SELECT ON market.v_mw_premium TO anon, authenticated;
GRANT SELECT ON market.v_mw_free    TO anon, authenticated;
