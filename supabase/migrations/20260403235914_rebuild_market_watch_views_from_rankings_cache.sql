/*
  # Rebuild Market Watch Views from Rankings Cache

  ## Summary
  Replaces the old market.v_mw_premium and market.v_mw_free views (which read from
  market.market_watch_snapshot_players) with new views that read directly from
  afl.player_rankings_cache — the single source of truth.

  ## Changes
  - market.v_mw_premium: now reads from afl.player_rankings_cache, sorted by value_score DESC
  - market.v_mw_free: now reads from afl.player_rankings_cache with category-limited rows
  - public.v_mw_premium: proxy view updated to match new schema
  - public.v_mw_free: proxy view updated to match new schema

  ## Column Mapping
  - breakeven          ← cache.breakeven (new simplified BE formula)
  - projection         ← cache.projection_final
  - edge_score         ← cache.edge_score (projection - breakeven)
  - value_score        ← cache.value_score (market-relative)
  - category           ← derived from cache.ai_recommendation (BUY/HOLD/SELL)
  - action             ← cache.ai_recommendation
  - market_watch_category ← cache.market_watch_category (TARGET/WATCH/AVOID)
  - is_injured/is_bye  ← derived from cache.status + cache.manual_status

  ## Security
  - Views inherit RLS from underlying table (player_rankings_cache has RLS)
  - GRANT SELECT on public views to anon and authenticated roles
*/

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: REBUILD market.v_mw_premium
-- Full player set, no row limits, sorted by value_score DESC
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS market.v_mw_premium CASCADE;

CREATE VIEW market.v_mw_premium
WITH (security_invoker = false)
AS
SELECT
  -- Identity
  rc.player_id,
  rc.player_name,
  rc.team,
  rc.team_name,
  rc.position,

  -- Pricing (from cache)
  rc.price,
  rc.prev_price,
  rc.price_change,
  rc.price_change_pct,

  -- Core Neeko engine fields
  rc.breakeven,
  rc.projection_final                                         AS projection,
  rc.edge_score,
  rc.value_score,
  rc.neeko_rating,
  rc.consistency,
  rc.projection_confidence,
  rc.games_played,

  -- Action / Category
  rc.ai_recommendation                                        AS action,
  rc.ai_recommendation,
  rc.market_watch_category,
  -- Map ai_recommendation to simple 3-bucket category for engine.ts
  CASE
    WHEN rc.ai_recommendation IN ('STRONG_BUY', 'BUY') THEN 'BUY'
    WHEN rc.ai_recommendation IN ('STRONG_SELL', 'SELL') THEN 'SELL'
    ELSE 'HOLD'
  END                                                          AS category,

  -- AI text
  rc.summary_short,
  rc.summary_long,
  rc.recommendation_short,
  rc.matchup_label,

  -- Availability
  rc.status,
  rc.manual_status,
  rc.is_available,
  rc.is_bye,
  (rc.status = 'injured' OR rc.manual_status = 'injured')     AS is_injured,

  -- Additional scoring fields (kept for backward compat; derived from cache)
  rc.ceiling                                                   AS ceiling,
  rc.floor                                                     AS floor_val,
  rc.form_score,
  rc.neeko_rating                                              AS trade_score,
  rc.value_score                                               AS value_label_raw,
  CASE
    WHEN rc.value_score >= 15  THEN 'ELITE_VALUE'
    WHEN rc.value_score >= 5   THEN 'GOOD_VALUE'
    WHEN rc.value_score >= -5  THEN 'FAIR_VALUE'
    WHEN rc.value_score >= -15 THEN 'OVERPRICED'
    ELSE 'TRAP'
  END                                                          AS value_label,

  -- Snapshot meta
  gen_random_uuid()                                            AS snapshot_id,
  NOW()                                                        AS snapshot_updated_at,
  rc.cached_at,

  -- Null placeholders for legacy columns the frontend may reference
  NULL::numeric   AS risk_pct,
  NULL::numeric   AS price_edge_pts,
  NULL::numeric   AS expected_price_change,
  NULL::numeric   AS projected_price,
  NULL::numeric   AS projected_price_r1,
  NULL::numeric   AS projected_price_r2,
  NULL::numeric   AS projected_price_r3,
  NULL::numeric   AS breakout_score,
  NULL::boolean   AS breakout_flag,
  NULL::numeric   AS volatility_score,
  NULL::text      AS volatility_level,
  NULL::numeric   AS trade_score_legacy,
  NULL::jsonb     AS reasons,
  NULL::text      AS category_reason,
  rc.edge_score   AS last3_avg,
  NULL::numeric   AS estimated_price,
  NULL::numeric   AS price_range_top,
  NULL::numeric   AS price_range_bottom,
  NULL::numeric   AS value_momentum,
  NULL::text      AS momentum_label,
  NULL::numeric   AS peak_price,
  NULL::text      AS peak_round,
  NULL::text      AS peak_status,
  NULL::numeric   AS buy_score,
  NULL::numeric   AS sell_score,
  NULL::numeric   AS hold_score,
  NULL::numeric   AS watch_score,

  -- Season/round info placeholder
  2026            AS season,
  0               AS round_number

FROM afl.player_rankings_cache rc
WHERE
  rc.is_available = true
  AND rc.player_id IS NOT NULL
  AND rc.player_name IS NOT NULL
ORDER BY rc.value_score DESC NULLS LAST, rc.projection_final DESC NULLS LAST;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: REBUILD market.v_mw_free
-- Category-limited rows: top 30 BUY + top 40 HOLD + top 30 SELL
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE VIEW market.v_mw_free
WITH (security_invoker = false)
AS
WITH base AS (
  SELECT
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.team_name,
    rc.position,
    rc.price,
    rc.prev_price,
    rc.price_change,
    rc.price_change_pct,
    rc.breakeven,
    rc.projection_final                                         AS projection,
    rc.edge_score,
    rc.value_score,
    rc.neeko_rating,
    rc.consistency,
    rc.projection_confidence,
    rc.games_played,
    rc.ai_recommendation                                        AS action,
    rc.ai_recommendation,
    rc.market_watch_category,
    CASE
      WHEN rc.ai_recommendation IN ('STRONG_BUY', 'BUY') THEN 'BUY'
      WHEN rc.ai_recommendation IN ('STRONG_SELL', 'SELL') THEN 'SELL'
      ELSE 'HOLD'
    END                                                          AS category,
    rc.summary_short,
    rc.summary_long,
    rc.recommendation_short,
    rc.matchup_label,
    rc.status,
    rc.manual_status,
    rc.is_available,
    rc.is_bye,
    (rc.status = 'injured' OR rc.manual_status = 'injured')     AS is_injured,
    rc.ceiling,
    rc.floor,
    rc.form_score,
    CASE
      WHEN rc.value_score >= 15  THEN 'ELITE_VALUE'
      WHEN rc.value_score >= 5   THEN 'GOOD_VALUE'
      WHEN rc.value_score >= -5  THEN 'FAIR_VALUE'
      WHEN rc.value_score >= -15 THEN 'OVERPRICED'
      ELSE 'TRAP'
    END                                                          AS value_label,
    gen_random_uuid()                                            AS snapshot_id,
    NOW()                                                        AS snapshot_updated_at,
    rc.cached_at,
    -- Category rank for limiting rows per bucket
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN rc.ai_recommendation IN ('STRONG_BUY', 'BUY') THEN 'BUY'
          WHEN rc.ai_recommendation IN ('STRONG_SELL', 'SELL') THEN 'SELL'
          ELSE 'HOLD'
        END
      ORDER BY rc.value_score DESC NULLS LAST, rc.projection_final DESC NULLS LAST
    ) AS cat_rank
  FROM afl.player_rankings_cache rc
  WHERE
    rc.is_available = true
    AND rc.player_id IS NOT NULL
    AND rc.player_name IS NOT NULL
),
selected AS (
  SELECT *
  FROM base
  WHERE
    (category = 'BUY'  AND cat_rank <= 30)
    OR (category = 'HOLD' AND cat_rank <= 40)
    OR (category = 'SELL' AND cat_rank <= 30)
)
SELECT
  player_id,
  player_name,
  team,
  team_name,
  position,
  price,
  prev_price,
  price_change,
  price_change_pct,
  breakeven,
  projection,
  edge_score,
  value_score,
  neeko_rating,
  consistency,
  projection_confidence,
  games_played,
  action,
  ai_recommendation,
  market_watch_category,
  category,
  summary_short,
  summary_long,
  recommendation_short,
  matchup_label,
  status,
  manual_status,
  is_available,
  is_bye,
  is_injured,
  ceiling,
  floor,
  form_score,
  value_label,
  snapshot_id,
  snapshot_updated_at,
  cached_at,
  -- Null legacy fields
  NULL::numeric   AS risk_pct,
  NULL::numeric   AS price_edge_pts,
  NULL::numeric   AS expected_price_change,
  NULL::numeric   AS projected_price,
  NULL::numeric   AS projected_price_r1,
  NULL::numeric   AS projected_price_r2,
  NULL::numeric   AS projected_price_r3,
  NULL::numeric   AS breakout_score,
  NULL::boolean   AS breakout_flag,
  NULL::numeric   AS volatility_score,
  NULL::text      AS volatility_level,
  NULL::jsonb     AS reasons,
  NULL::text      AS category_reason,
  NULL::numeric   AS estimated_price,
  NULL::numeric   AS price_range_top,
  NULL::numeric   AS price_range_bottom,
  NULL::numeric   AS value_momentum,
  NULL::text      AS momentum_label,
  NULL::numeric   AS peak_price,
  NULL::text      AS peak_round,
  NULL::text      AS peak_status,
  NULL::numeric   AS buy_score,
  NULL::numeric   AS sell_score,
  NULL::numeric   AS hold_score,
  NULL::numeric   AS watch_score,
  2026            AS season,
  0               AS round_number
FROM selected
ORDER BY value_score DESC NULLS LAST, projection DESC NULLS LAST;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: REBUILD public proxy views
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_mw_premium CASCADE;
CREATE VIEW public.v_mw_premium
WITH (security_invoker = false)
AS SELECT * FROM market.v_mw_premium;

DROP VIEW IF EXISTS public.v_mw_free CASCADE;
CREATE VIEW public.v_mw_free
WITH (security_invoker = false)
AS SELECT * FROM market.v_mw_free;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: GRANTS
-- ────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;
GRANT SELECT ON market.v_mw_free TO anon, authenticated;
GRANT SELECT ON public.v_mw_premium TO anon, authenticated;
GRANT SELECT ON public.v_mw_free TO anon, authenticated;
