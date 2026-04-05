
/*
  # Fix Market Watch Views — Signal Mapping, Value Calculation, Ordering

  ## Root Cause
  Three compounding bugs caused incorrect Market Watch output:

  1. **Broken signal mapping**: `category` CASE checked for `signal_tag = 'Target'` but the 
     actual values in `player_rankings_cache` are `STRONG_UP`, `UP`, `STABLE`, `DOWN`, `STRONG_DOWN`.
     Every player fell through to `Avoid` — hence 100% Avoid category.

  2. **Wrong sort metric**: list was ordered by `projection DESC` giving top spots to the
     highest projecting (highest priced) players, not the best trade-value players.
     Now ordered by `value_score DESC` within each tier — consistent with Rankings.

  3. **Quality filters**: was allowing players with < 2 games (v_mw_free) and no minimum
     projection threshold, letting rookies with inflated value scores dominate the top.
     New floor: games_played >= 3, projection_final >= 50.

  ## Changes to market.v_mw_premium
  - Fix category CASE: STRONG_UP/UP → Target, STRONG_DOWN/DOWN → Avoid, STABLE → Watch
  - Fix action CASE: same mapping
  - Order by value_score DESC (Target/Watch) and value_score ASC (Avoid — worst first)
  - Quality filters: projection >= 50, games_played >= 3
  - Add value_score as trailing column (preserves existing column positions)

  ## Changes to market.v_mw_free
  - Same signal mapping fix
  - Same ordering and quality filters
  - Smaller row caps: 20 Target, 30 Watch, 20 Avoid
  - Add value_score as trailing column

  ## Security
  - No RLS changes — views inherit existing permissions
*/

-- ============================================================
-- Fix market.v_mw_premium
-- Drop and recreate to allow adding value_score column
-- ============================================================
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;

CREATE VIEW market.v_mw_premium AS
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
    round(rc.projection_final - rc.breakeven, 2) AS value_gap,
    rc.signal_tag,
    rc.signal,
    -- FIX: map from actual signal values in player_rankings_cache
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')    THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN') THEN 'Avoid'
      ELSE                                           'Watch'
    END AS category,
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')    THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN') THEN 'Avoid'
      ELSE                                           'Watch'
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
    1 AS round_number,
    rc.value_score
  FROM afl.player_rankings_cache rc
  WHERE
    rc.is_available = true
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final >= 50
    AND rc.price IS NOT NULL
    AND rc.price > 0
    AND rc.signal IS NOT NULL
    AND COALESCE(rc.games_played, 0) >= 3
),
targets AS (
  SELECT *, row_number() OVER (ORDER BY value_score DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Target'
),
watches AS (
  SELECT *, row_number() OVER (ORDER BY value_score DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Watch'
),
avoids AS (
  SELECT *, row_number() OVER (ORDER BY value_score ASC NULLS LAST) AS rn
  FROM base WHERE category = 'Avoid'
),
combined AS (
  SELECT * FROM targets WHERE rn <= 60
  UNION ALL
  SELECT * FROM watches WHERE rn <= 80
  UNION ALL
  SELECT * FROM avoids WHERE rn <= 60
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
  floor_val,
  risk_pct,
  value_gap,
  signal_tag,
  signal,
  category,
  action,
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
  is_injured,
  snapshot_updated_at,
  season,
  round_number,
  value_score
FROM combined
ORDER BY
  CASE category
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    WHEN 'Avoid'  THEN 3
    ELSE 4
  END,
  CASE category
    -- Avoids: worst value first (most negative value_score at top)
    WHEN 'Avoid' THEN value_score
    -- Target/Watch: best value first
    ELSE value_score * -1
  END;


-- ============================================================
-- Fix market.v_mw_free
-- Drop and recreate to allow adding value_score column
-- ============================================================
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE VIEW market.v_mw_free AS
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
    round(rc.projection_final - rc.breakeven, 2) AS value_gap,
    rc.signal_tag,
    rc.signal,
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')    THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN') THEN 'Avoid'
      ELSE                                           'Watch'
    END AS category,
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')    THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN') THEN 'Avoid'
      ELSE                                           'Watch'
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
    1 AS round_number,
    rc.value_score
  FROM afl.player_rankings_cache rc
  WHERE
    rc.is_available = true
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final >= 50
    AND rc.price IS NOT NULL
    AND rc.price > 0
    AND rc.signal IS NOT NULL
    AND COALESCE(rc.games_played, 0) >= 3
),
targets AS (
  SELECT *, row_number() OVER (ORDER BY value_score DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Target'
),
watches AS (
  SELECT *, row_number() OVER (ORDER BY value_score DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Watch'
),
avoids AS (
  SELECT *, row_number() OVER (ORDER BY value_score ASC NULLS LAST) AS rn
  FROM base WHERE category = 'Avoid'
),
combined AS (
  SELECT * FROM targets WHERE rn <= 20
  UNION ALL
  SELECT * FROM watches WHERE rn <= 30
  UNION ALL
  SELECT * FROM avoids WHERE rn <= 20
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
  floor_val,
  risk_pct,
  value_gap,
  signal_tag,
  signal,
  category,
  action,
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
  is_injured,
  snapshot_updated_at,
  season,
  round_number,
  value_score
FROM combined
ORDER BY
  CASE category
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    WHEN 'Avoid'  THEN 3
    ELSE 4
  END,
  CASE category
    WHEN 'Avoid' THEN value_score
    ELSE value_score * -1
  END;
