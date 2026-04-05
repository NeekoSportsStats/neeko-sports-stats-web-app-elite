
/*
  # Fix Market Watch Views — Use Correct Value Column for Sorting

  ## Additional Root Cause Found
  The previous fix corrected the signal-to-category mapping but still sorted by `value_score`,
  which has a severely skewed distribution: range -34.89 to +6.71, median -2.82. This means
  even the best UP/STRONG_UP players show negative value scores, making the list appear broken.

  The correct column is `value` (not `value_score`), which is properly price-normalised:
  - STRONG_UP players: all positive, avg +4.24 (range 2.0 – 8.2)
  - UP players:         all positive, avg +2.09 (range 1.0 – 4.2)
  - STABLE players:     near zero,   avg +0.33
  - DOWN players:       all negative, avg -1.35
  - STRONG_DOWN:        all negative, avg -3.05

  This gives clean separation with a healthy positive/negative distribution, fully consistent
  with the Rankings page value signal.

  ## Changes to market.v_mw_premium and market.v_mw_free
  - Sort and expose `value` column (not `value_score`)
  - `value_score` column kept for backward-compat but sorted by `value`
  - Ordering: Target/Watch sorted by value DESC (best first), Avoid sorted by value ASC (worst first)
  - Quality filters unchanged: projection >= 50, games_played >= 3
*/

-- ============================================================
-- Rebuild market.v_mw_premium with correct value column
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
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')     THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN')  THEN 'Avoid'
      ELSE                                            'Watch'
    END AS category,
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')     THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN')  THEN 'Avoid'
      ELSE                                            'Watch'
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
    rc.value_score,
    rc.value AS value_metric
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
  SELECT *, row_number() OVER (ORDER BY value_metric DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Target'
),
watches AS (
  SELECT *, row_number() OVER (ORDER BY value_metric DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Watch'
),
avoids AS (
  SELECT *, row_number() OVER (ORDER BY value_metric ASC NULLS LAST) AS rn
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
  value_score,
  value_metric
FROM combined
ORDER BY
  CASE category
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    WHEN 'Avoid'  THEN 3
    ELSE 4
  END,
  CASE category
    WHEN 'Avoid' THEN value_metric
    ELSE value_metric * -1
  END;


-- ============================================================
-- Rebuild market.v_mw_free with correct value column
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
      WHEN rc.signal IN ('STRONG_UP', 'UP')     THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN')  THEN 'Avoid'
      ELSE                                            'Watch'
    END AS category,
    CASE
      WHEN rc.signal IN ('STRONG_UP', 'UP')     THEN 'Target'
      WHEN rc.signal IN ('STRONG_DOWN', 'DOWN')  THEN 'Avoid'
      ELSE                                            'Watch'
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
    rc.value_score,
    rc.value AS value_metric
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
  SELECT *, row_number() OVER (ORDER BY value_metric DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Target'
),
watches AS (
  SELECT *, row_number() OVER (ORDER BY value_metric DESC NULLS LAST) AS rn
  FROM base WHERE category = 'Watch'
),
avoids AS (
  SELECT *, row_number() OVER (ORDER BY value_metric ASC NULLS LAST) AS rn
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
  value_score,
  value_metric
FROM combined
ORDER BY
  CASE category
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    WHEN 'Avoid'  THEN 3
    ELSE 4
  END,
  CASE category
    WHEN 'Avoid' THEN value_metric
    ELSE value_metric * -1
  END;
