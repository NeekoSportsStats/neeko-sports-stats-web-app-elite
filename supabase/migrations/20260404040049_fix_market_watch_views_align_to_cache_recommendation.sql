/*
  # Fix Market Watch Views: Align category/action to ai_recommendation from cache

  ## Problem
  The v_mw_premium and v_mw_free views compute their own BUY/SELL/HOLD using
  (projection - breakeven) thresholds that no longer match the cache function
  now that breakeven = price/7200. Views must defer to ai_recommendation from
  the cache as the single source of truth.

  ## Changes
  1. Both market schema views use rc.ai_recommendation for category/action
  2. public schema proxy views are rebuilt identically to pass data through
  3. value_gap kept as (projection - breakeven) for informational display
  4. Bucketing in free tier uses ai_recommendation-derived category

  ## Result
  Market Watch category/action always matches Rankings ai_recommendation.
  One source of truth: afl.player_rankings_cache.ai_recommendation
*/

-- Drop public proxy views first (they depend on market views)
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;
DROP VIEW IF EXISTS public.v_mw_free CASCADE;

-- Drop market views
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

-- ── market.v_mw_premium ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW market.v_mw_premium AS
SELECT
  (gen_random_uuid())::text                        AS snapshot_id,
  rc.player_id,
  rc.player_name,
  rc.team,
  rc.position,
  rc.price,
  rc.breakeven,
  rc.projection_final                              AS projection,
  rc.ceiling,
  rc.floor                                         AS floor_val,
  rc.risk_rating                                   AS risk_pct,
  ROUND((rc.projection_final - rc.breakeven)::numeric, 2) AS value_gap,
  CASE
    WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY')   THEN 'BUY'
    WHEN rc.ai_recommendation IN ('SELL', 'STRONG_SELL') THEN 'SELL'
    ELSE 'HOLD'
  END                                              AS category,
  CASE
    WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY')   THEN 'BUY'
    WHEN rc.ai_recommendation IN ('SELL', 'STRONG_SELL') THEN 'SELL'
    ELSE 'HOLD'
  END                                              AS action,
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
  false                                            AS is_injured,
  COALESCE(rc.cached_at, now())                   AS snapshot_updated_at,
  2026                                             AS season,
  1                                                AS round_number
FROM afl.player_rankings_cache rc
WHERE rc.is_available = true
  AND rc.projection_final IS NOT NULL
  AND rc.projection_final > 0
  AND rc.price IS NOT NULL
  AND rc.price > 0
  AND (rc.is_bye IS NULL OR rc.is_bye = false)
  AND rc.ai_recommendation IS NOT NULL
ORDER BY
  CASE rc.ai_recommendation
    WHEN 'STRONG_BUY'  THEN 1
    WHEN 'BUY'         THEN 2
    WHEN 'HOLD'        THEN 3
    WHEN 'SELL'        THEN 4
    WHEN 'STRONG_SELL' THEN 5
    ELSE 6
  END,
  (rc.projection_final - rc.breakeven) DESC NULLS LAST
LIMIT 300;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;


-- ── market.v_mw_free ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW market.v_mw_free AS
WITH base AS (
  SELECT
    (gen_random_uuid())::text                        AS snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    rc.breakeven,
    rc.projection_final                              AS projection,
    rc.ceiling,
    rc.floor                                         AS floor_val,
    rc.risk_rating                                   AS risk_pct,
    ROUND((rc.projection_final - rc.breakeven)::numeric, 2) AS value_gap,
    CASE
      WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY')   THEN 'BUY'
      WHEN rc.ai_recommendation IN ('SELL', 'STRONG_SELL') THEN 'SELL'
      ELSE 'HOLD'
    END                                              AS category,
    CASE
      WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY')   THEN 'BUY'
      WHEN rc.ai_recommendation IN ('SELL', 'STRONG_SELL') THEN 'SELL'
      ELSE 'HOLD'
    END                                              AS action,
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
    false                                            AS is_injured,
    COALESCE(rc.cached_at, now())                   AS snapshot_updated_at,
    2026                                             AS season,
    1                                                AS round_number
  FROM afl.player_rankings_cache rc
  WHERE rc.is_available = true
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final > 0
    AND rc.price IS NOT NULL
    AND rc.price > 0
    AND (rc.is_bye IS NULL OR rc.is_bye = false)
    AND rc.ai_recommendation IS NOT NULL
),
buys AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap DESC) AS rn
  FROM base WHERE category = 'BUY'
),
holds AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap DESC) AS rn
  FROM base WHERE category = 'HOLD'
),
sells AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap ASC) AS rn
  FROM base WHERE category = 'SELL'
),
combined AS (
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap, category, action,
         ai_recommendation, recommendation_short, summary_short, summary_long,
         matchup_label, prev_price, price_change, consistency, projection_confidence,
         neeko_rating, status, manual_status, is_bye, is_injured,
         snapshot_updated_at, season, round_number
  FROM buys  WHERE rn <= 30
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap, category, action,
         ai_recommendation, recommendation_short, summary_short, summary_long,
         matchup_label, prev_price, price_change, consistency, projection_confidence,
         neeko_rating, status, manual_status, is_bye, is_injured,
         snapshot_updated_at, season, round_number
  FROM holds WHERE rn <= 40
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap, category, action,
         ai_recommendation, recommendation_short, summary_short, summary_long,
         matchup_label, prev_price, price_change, consistency, projection_confidence,
         neeko_rating, status, manual_status, is_bye, is_injured,
         snapshot_updated_at, season, round_number
  FROM sells WHERE rn <= 30
)
SELECT * FROM combined
ORDER BY value_gap DESC NULLS LAST, projection DESC NULLS LAST;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;


-- ── public proxy views (pass-through wrappers used by PostgREST) ─────────────
CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT
  snapshot_id, player_id, player_name, team, position, price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap, category, action,
  ai_recommendation, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM market.v_mw_premium;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_free AS
SELECT
  snapshot_id, player_id, player_name, team, position, price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap, category, action,
  ai_recommendation, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM market.v_mw_free;

GRANT SELECT ON public.v_mw_free TO anon, authenticated;
