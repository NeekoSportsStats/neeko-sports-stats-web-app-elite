/*
  # Market Watch Clean Value Model — value_gap as single source of truth

  ## Summary
  Rebuilds the Market Watch views to use a clean, consistent value system:

  1. **value_gap** = `projection_final - breakeven` (both from afl.player_rankings_cache)
     The breakeven column is already populated from season averages (or price/7200 fallback),
     exactly matching the Rankings page formula. No divergence between pages.

  2. **Signal logic** — threshold-based, no AI override:
     - value_gap >= 10  → BUY  (Target)
     - value_gap <= -6  → SELL (Avoid)
     - otherwise        → HOLD (Watch)

  3. **Ordering** — `value_gap DESC`

  4. **Fixes applied**
     - `snapshot_updated_at` reads `rc.cached_at` (real timestamp, not NOW())
     - Removed dead columns: last3_avg, breakout_score, breakout_flag, value_score,
       expected_price_change (not in cache), volatility_score (not in cache)
     - `summary_short` is the only text used (display supplement, not signal)

  ## Views rebuilt
  - market.v_mw_premium, market.v_mw_free
  - public.v_mw_premium, public.v_mw_free (PostgREST proxies)
*/

DROP VIEW IF EXISTS public.v_mw_premium CASCADE;
DROP VIEW IF EXISTS public.v_mw_free CASCADE;
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PREMIUM VIEW
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW market.v_mw_premium AS
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

  (rc.projection_final - rc.breakeven)::numeric(8,2) AS value_gap,

  CASE
    WHEN (rc.projection_final - rc.breakeven) >= 10 THEN 'BUY'
    WHEN (rc.projection_final - rc.breakeven) <= -6 THEN 'SELL'
    ELSE 'HOLD'
  END AS category,

  CASE
    WHEN (rc.projection_final - rc.breakeven) >= 10 THEN 'BUY'
    WHEN (rc.projection_final - rc.breakeven) <= -6 THEN 'SELL'
    ELSE 'HOLD'
  END AS action,

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
  COALESCE(rc.cached_at, NOW())  AS snapshot_updated_at,
  2026                           AS season,
  1                              AS round_number

FROM afl.player_rankings_cache rc
WHERE rc.is_available = true
  AND rc.projection_final IS NOT NULL
  AND rc.projection_final > 0
  AND rc.price IS NOT NULL
  AND rc.price > 0
  AND (rc.is_bye IS NULL OR rc.is_bye = false)
ORDER BY (rc.projection_final - rc.breakeven) DESC NULLS LAST,
         rc.projection_final DESC NULLS LAST
LIMIT 300;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- FREE VIEW — balanced sample: top 30 BUY + 40 HOLD + 30 SELL
-- ─────────────────────────────────────────────────────────────────────────────
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
    (rc.projection_final - rc.breakeven)::numeric(8,2) AS value_gap,
    CASE
      WHEN (rc.projection_final - rc.breakeven) >= 10 THEN 'BUY'
      WHEN (rc.projection_final - rc.breakeven) <= -6 THEN 'SELL'
      ELSE 'HOLD'
    END AS category,
    CASE
      WHEN (rc.projection_final - rc.breakeven) >= 10 THEN 'BUY'
      WHEN (rc.projection_final - rc.breakeven) <= -6 THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
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
    COALESCE(rc.cached_at, NOW())  AS snapshot_updated_at,
    2026                           AS season,
    1                              AS round_number
  FROM afl.player_rankings_cache rc
  WHERE rc.is_available = true
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final > 0
    AND rc.price IS NOT NULL
    AND rc.price > 0
    AND (rc.is_bye IS NULL OR rc.is_bye = false)
),
buys  AS (SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap DESC) AS rn FROM base WHERE category = 'BUY'),
holds AS (SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap DESC) AS rn FROM base WHERE category = 'HOLD'),
sells AS (SELECT *, ROW_NUMBER() OVER (ORDER BY value_gap ASC)  AS rn FROM base WHERE category = 'SELL')
SELECT
  snapshot_id, player_id, player_name, team, position, price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap, category, action,
  ai_recommendation, recommendation_short, summary_short, summary_long, matchup_label,
  prev_price, price_change, consistency, projection_confidence, neeko_rating,
  status, manual_status, is_bye, is_injured, snapshot_updated_at, season, round_number
FROM (
  SELECT * FROM buys  WHERE rn <= 30
  UNION ALL
  SELECT * FROM holds WHERE rn <= 40
  UNION ALL
  SELECT * FROM sells WHERE rn <= 30
) combined
ORDER BY value_gap DESC NULLS LAST, projection DESC NULLS LAST;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PUBLIC PROXY VIEWS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_mw_premium AS SELECT * FROM market.v_mw_premium;
GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

CREATE VIEW public.v_mw_free AS SELECT * FROM market.v_mw_free;
GRANT SELECT ON public.v_mw_free TO anon, authenticated;
