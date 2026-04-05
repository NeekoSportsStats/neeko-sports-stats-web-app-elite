/*
  # Fix Market Watch views - signal_tag case mismatch + rookie guardrails

  ## Problems
  1. market.v_mw_premium and market.v_mw_free compare signal_tag against
     'TARGET', 'AVOID', 'WATCH' (UPPERCASE) but actual values are 'Target',
     'Watch', 'Avoid' (Title Case). This means category/action are ALWAYS 'HOLD'
     regardless of actual signal.

  2. public.v_mw_free proxies market.v_mw_free which inherits the same bug.

  3. public.v_mw_free takes top 30 TARGET + 40 WATCH + 30 AVOID, ordered purely
     by value_gap DESC — this surfaces min-price rookies with 0 games at the top.

  ## Fixes
  1. Rebuild market.v_mw_premium with correct Title Case comparisons
  2. Rebuild market.v_mw_free with correct Title Case + games_played >= 2 guardrail
  3. Rebuild public.v_mw_free to use correct ordering (signal priority + projection)
  4. Rebuild public.v_mw_premium to match
*/

-- Fix market.v_mw_premium: correct signal_tag case comparisons
CREATE OR REPLACE VIEW market.v_mw_premium AS
SELECT
  gen_random_uuid()::text AS snapshot_id,
  player_id,
  player_name,
  team,
  "position",
  price,
  breakeven,
  projection_final AS projection,
  ceiling,
  floor AS floor_val,
  risk_rating AS risk_pct,
  ROUND(projection_final - breakeven, 2) AS value_gap,
  signal_tag,
  signal,
  CASE
    WHEN signal_tag = 'Target' THEN 'Target'
    WHEN signal_tag = 'Watch'  THEN 'Watch'
    ELSE 'Avoid'
  END AS category,
  CASE
    WHEN signal IN ('STRONG_BUY', 'BUY') THEN 'Target'
    WHEN signal IN ('STRONG_SELL', 'SELL') THEN 'Avoid'
    ELSE 'Watch'
  END AS action,
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
  AND projection_final IS NOT NULL
  AND projection_final > 0
  AND price IS NOT NULL
  AND price > 0
  AND signal IS NOT NULL
ORDER BY
  CASE signal_tag
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    WHEN 'Avoid'  THEN 3
    ELSE 4
  END,
  projection_final DESC NULLS LAST
LIMIT 300;

-- Fix market.v_mw_free: correct case + games_played >= 2 guardrail to prevent 0-game rookies
CREATE OR REPLACE VIEW market.v_mw_free AS
WITH base AS (
  SELECT
    gen_random_uuid()::text AS snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc."position",
    rc.price,
    rc.breakeven,
    rc.projection_final AS projection,
    rc.ceiling,
    rc.floor AS floor_val,
    rc.risk_rating AS risk_pct,
    ROUND(rc.projection_final - rc.breakeven, 2) AS value_gap,
    rc.signal_tag,
    rc.signal,
    CASE
      WHEN rc.signal_tag = 'Target' THEN 'Target'
      WHEN rc.signal_tag = 'Watch'  THEN 'Watch'
      ELSE 'Avoid'
    END AS category,
    CASE
      WHEN rc.signal IN ('STRONG_BUY', 'BUY') THEN 'Target'
      WHEN rc.signal IN ('STRONG_SELL', 'SELL') THEN 'Avoid'
      ELSE 'Watch'
    END AS action,
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
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final > 0
    AND rc.price IS NOT NULL
    AND rc.price > 0
    AND rc.signal IS NOT NULL
    AND COALESCE(rc.games_played, 0) >= 2
),
targets AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY projection DESC NULLS LAST) AS rn
  FROM base WHERE signal_tag = 'Target'
),
watches AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY projection DESC NULLS LAST) AS rn
  FROM base WHERE signal_tag = 'Watch'
),
avoids AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY projection DESC NULLS LAST) AS rn
  FROM base WHERE signal_tag = 'Avoid'
),
combined AS (
  SELECT snapshot_id, player_id, player_name, team, "position", price, breakeven,
    projection, ceiling, floor_val, risk_pct, value_gap, signal_tag, signal,
    category, action, recommendation_short, summary_short, summary_long,
    matchup_label, prev_price, price_change, consistency, projection_confidence,
    neeko_rating, status, manual_status, is_bye, is_injured,
    snapshot_updated_at, season, round_number
  FROM targets WHERE rn <= 20
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, "position", price, breakeven,
    projection, ceiling, floor_val, risk_pct, value_gap, signal_tag, signal,
    category, action, recommendation_short, summary_short, summary_long,
    matchup_label, prev_price, price_change, consistency, projection_confidence,
    neeko_rating, status, manual_status, is_bye, is_injured,
    snapshot_updated_at, season, round_number
  FROM watches WHERE rn <= 30
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, "position", price, breakeven,
    projection, ceiling, floor_val, risk_pct, value_gap, signal_tag, signal,
    category, action, recommendation_short, summary_short, summary_long,
    matchup_label, prev_price, price_change, consistency, projection_confidence,
    neeko_rating, status, manual_status, is_bye, is_injured,
    snapshot_updated_at, season, round_number
  FROM avoids WHERE rn <= 20
)
SELECT * FROM combined
ORDER BY
  CASE signal_tag
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    WHEN 'Avoid'  THEN 3
    ELSE 4
  END,
  projection DESC NULLS LAST;

-- Rebuild public.v_mw_free to proxy the fixed market view (no changes needed to proxy itself)
CREATE OR REPLACE VIEW public.v_mw_free AS
SELECT
  snapshot_id, player_id, player_name, team, "position", price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap, signal_tag, signal,
  category, action, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM market.v_mw_free;

-- Rebuild public.v_mw_premium to proxy the fixed market view
CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT
  snapshot_id, player_id, player_name, team, "position", price, breakeven,
  projection, ceiling, floor_val, risk_pct, value_gap, signal_tag, signal,
  category, action, recommendation_short, summary_short, summary_long,
  matchup_label, prev_price, price_change, consistency, projection_confidence,
  neeko_rating, status, manual_status, is_bye, is_injured,
  snapshot_updated_at, season, round_number
FROM market.v_mw_premium;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;
GRANT SELECT ON market.v_mw_free TO anon, authenticated;
GRANT SELECT ON public.v_mw_free TO anon, authenticated;
GRANT SELECT ON public.v_mw_premium TO anon, authenticated;
