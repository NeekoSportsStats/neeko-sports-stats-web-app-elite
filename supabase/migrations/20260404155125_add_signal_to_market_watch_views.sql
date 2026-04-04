/*
  # Add canonical signal to Market Watch views

  ## Summary
  Adds the canonical 5-level `signal` column (STRONG_BUY | BUY | HOLD | SELL | STRONG_SELL)
  to both `market.v_mw_premium` and `market.v_mw_free` views, sourced from
  `afl.player_rankings_cache.signal`.

  ## Changes
  - `market.v_mw_premium`: DROP + recreate with `signal` column added after `signal_tag`
  - `market.v_mw_free`: DROP + recreate with `signal` column propagated through all CTEs
  - `public.v_mw_premium` (wrapper): DROP + recreate to expose `signal`
  - `public.v_mw_free` (wrapper): DROP + recreate to expose `signal`

  ## Notes
  - All existing columns preserved in same order
  - `signal` is sourced directly from `rc.signal` in `afl.player_rankings_cache`
  - No data loss — purely additive view change
*/

-- ─── market.v_mw_premium ────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;

CREATE VIEW market.v_mw_premium AS
SELECT
  gen_random_uuid()::text AS snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection_final AS projection,
  ceiling,
  floor AS floor_val,
  risk_rating AS risk_pct,
  round(projection_final - breakeven, 2) AS value_gap,
  signal_tag,
  signal,
  CASE
    WHEN signal_tag = 'TARGET' THEN 'BUY'
    WHEN signal_tag = 'AVOID'  THEN 'SELL'
    ELSE 'HOLD'
  END AS category,
  CASE
    WHEN signal_tag = 'TARGET' THEN 'BUY'
    WHEN signal_tag = 'AVOID'  THEN 'SELL'
    ELSE 'HOLD'
  END AS action,
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
  false AS is_injured,
  COALESCE(cached_at, now()) AS snapshot_updated_at,
  2026 AS season,
  1 AS round_number
FROM afl.player_rankings_cache rc
WHERE
  is_available = true
  AND projection_final IS NOT NULL AND projection_final > 0
  AND price IS NOT NULL AND price > 0
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

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;

-- ─── market.v_mw_free ───────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_mw_free CASCADE;
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE VIEW market.v_mw_free AS
WITH base AS (
  SELECT
    gen_random_uuid()::text AS snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    rc.breakeven,
    rc.projection_final AS projection,
    rc.ceiling,
    rc.floor AS floor_val,
    rc.risk_rating AS risk_pct,
    round(rc.projection_final - rc.breakeven, 2) AS value_gap,
    rc.signal_tag,
    rc.signal,
    CASE
      WHEN rc.signal_tag = 'TARGET' THEN 'BUY'
      WHEN rc.signal_tag = 'AVOID'  THEN 'SELL'
      ELSE 'HOLD'
    END AS category,
    CASE
      WHEN rc.signal_tag = 'TARGET' THEN 'BUY'
      WHEN rc.signal_tag = 'AVOID'  THEN 'SELL'
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
    false AS is_injured,
    COALESCE(rc.cached_at, now()) AS snapshot_updated_at,
    2026 AS season,
    1 AS round_number
  FROM afl.player_rankings_cache rc
  WHERE
    rc.is_available = true
    AND rc.projection_final IS NOT NULL AND rc.projection_final > 0
    AND rc.price IS NOT NULL AND rc.price > 0
    AND (rc.is_bye IS NULL OR rc.is_bye = false)
    AND rc.ai_recommendation IS NOT NULL
),
targets AS (
  SELECT *, row_number() OVER (ORDER BY value_gap DESC) AS rn
  FROM base WHERE signal_tag = 'TARGET'
),
watches AS (
  SELECT *, row_number() OVER (ORDER BY value_gap DESC) AS rn
  FROM base WHERE signal_tag = 'WATCH'
),
avoids AS (
  SELECT *, row_number() OVER (ORDER BY value_gap) AS rn
  FROM base WHERE signal_tag = 'AVOID'
),
combined AS (
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap,
         signal_tag, signal, category, action,
         ai_recommendation, recommendation_short, summary_short, summary_long,
         matchup_label, prev_price, price_change, consistency, projection_confidence,
         neeko_rating, status, manual_status, is_bye, is_injured,
         snapshot_updated_at, season, round_number
  FROM targets WHERE rn <= 30
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap,
         signal_tag, signal, category, action,
         ai_recommendation, recommendation_short, summary_short, summary_long,
         matchup_label, prev_price, price_change, consistency, projection_confidence,
         neeko_rating, status, manual_status, is_bye, is_injured,
         snapshot_updated_at, season, round_number
  FROM watches WHERE rn <= 40
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven,
         projection, ceiling, floor_val, risk_pct, value_gap,
         signal_tag, signal, category, action,
         ai_recommendation, recommendation_short, summary_short, summary_long,
         matchup_label, prev_price, price_change, consistency, projection_confidence,
         neeko_rating, status, manual_status, is_bye, is_injured,
         snapshot_updated_at, season, round_number
  FROM avoids WHERE rn <= 30
)
SELECT
  snapshot_id, player_id, player_name, team, position, price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap,
  signal_tag, signal, category, action,
  ai_recommendation, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM combined
ORDER BY value_gap DESC NULLS LAST, projection DESC NULLS LAST;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;

-- ─── public wrapper views ───────────────────────────────────────────────────
CREATE VIEW public.v_mw_premium AS
SELECT
  snapshot_id, player_id, player_name, team, position, price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap,
  signal_tag, signal, category, action,
  ai_recommendation, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM market.v_mw_premium;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

CREATE VIEW public.v_mw_free AS
SELECT
  snapshot_id, player_id, player_name, team, position, price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap,
  signal_tag, signal, category, action,
  ai_recommendation, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM market.v_mw_free;

GRANT SELECT ON public.v_mw_free TO anon, authenticated;
