/*
  # Fix Breakeven - Use 2026 Season Average Consistently

  ## Summary
  Fixes breakeven calculation to use player's actual 2026 season average
  instead of formula-based estimates (price/7200).

  ## Problem
  - Market Watch: breakeven = price / 7200 (magic number formula)
  - Rankings: breakeven = priced_at from player_prices (actual average)
  - Result: Same player shows different breakeven in different views

  ## Solution
  - Market Watch breakeven = player's 2026 season average
  - Calculate from player_games table (AVG of fantasy_score)
  - Fall back to priced_at if available
  - Round to whole number (no decimals)

  ## Design Decision
  Breakeven = "What score does this player need to justify their price?"
  Answer: Their actual season average (what they're priced at)

  NOT: A formula-based estimate
  NOT: A projection
  NOT: A scaled value

  ## Changes
  1. Add season_avg CTE to calculate actual 2026 averages
  2. Replace price/7200 formula with actual average
  3. Use same logic as Rankings (prefer priced_at, fallback to calculation)
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'afl', 'public'
AS $function$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
  v_vs_p75       numeric;
  v_vs_p90       numeric;
  v_vs_p10       numeric;
  v_vs_p25       numeric;
  v_nr_p85       numeric;
  v_nr_p40       numeric;
  v_proj_p75     numeric;
  v_proj_p60     numeric;
  v_proj_p40     numeric;
BEGIN

SELECT season, MAX(week)
INTO   v_season, v_round
FROM   afl.player_games
GROUP  BY season
ORDER  BY season DESC
LIMIT  1;

IF v_season IS NULL THEN
  v_season := 2026;
  v_round  := 1;
END IF;

SELECT
  COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score), 2.0),
  COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value_score), 4.0),
  COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value_score), 0.1),
  COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score), 0.5),
  COALESCE(PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY neeko_rating), 56.0),
  COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY neeko_rating), 43.0)
INTO v_vs_p75, v_vs_p90, v_vs_p10, v_vs_p25, v_nr_p85, v_nr_p40
FROM afl.player_rankings_cache
WHERE value_score IS NOT NULL AND neeko_rating IS NOT NULL
  AND COALESCE(status, '') NOT IN ('retired', 'inactive')
  AND COALESCE(manual_status, '') NOT IN ('retired', 'inactive');

SELECT
  COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final), 75.0),
  COALESCE(PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final), 65.0),
  COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY projection_final), 54.0)
INTO v_proj_p75, v_proj_p60, v_proj_p40
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL AND projection_final > 0
  AND COALESCE(status, '') NOT IN ('retired', 'inactive')
  AND COALESCE(manual_status, '') NOT IN ('retired', 'inactive');

UPDATE market.market_watch_snapshot SET is_active = false;

INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
VALUES (v_season, v_round, true)
ON CONFLICT (season, round_number) DO UPDATE
SET updated_at = now(), is_active = true
RETURNING snapshot_id INTO v_snapshot_id;

DELETE FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id;

INSERT INTO market.market_watch_snapshot_players (
  snapshot_id, player_id, player_name, team, position,
  price, prev_price, price_change_pct,
  projection, breakeven, ceiling, risk_pct,
  price_edge_pts, expected_price_change, category, action, trade_score, reasons,
  projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
  breakout_score, breakout_flag, volatility_score, volatility_level,
  last3_avg, estimated_price, value_score,
  price_range_top, price_range_bottom, value_momentum, momentum_label,
  peak_price, peak_round, peak_status,
  buy_score, sell_score, hold_score, watch_score
)
WITH games_count AS (
  SELECT player_id, COUNT(*) AS games_played
  FROM   afl.player_games
  WHERE  season = v_season
  GROUP  BY player_id
),
last3 AS (
  SELECT player_id,
    ROUND(AVG(fantasy_score)::numeric, 1) AS last3_avg
  FROM (
    SELECT player_id, fantasy_score,
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
    FROM   afl.player_games
    WHERE  season = v_season AND fantasy_score IS NOT NULL
  ) ranked
  WHERE rn <= 3
  GROUP BY player_id
),
-- NEW: Calculate actual 2026 season average for each player
season_avg AS (
  SELECT
    player_id,
    ROUND(AVG(fantasy_score)::numeric, 0) AS avg_2026
  FROM afl.player_games
  WHERE season = v_season
    AND fantasy_score IS NOT NULL
  GROUP BY player_id
),
base AS (
  SELECT
    r.player_id, r.player_name, r.team, r.position,
    COALESCE(r.price, 0)::numeric                                          AS price,
    r.prev_price::integer                                                  AS prev_price,
    r.price_change_pct::numeric                                            AS price_change_pct,
    COALESCE(r.projection_final, r.projection, 0)::numeric                AS proj,
    -- NEW: Use actual season average (priced_at from player_prices OR calculated from games)
    COALESCE(
      pp.priced_at::numeric,
      sa.avg_2026::numeric,
      ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)
    ) AS breakeven,
    COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
    COALESCE(r.floor, r.floor_estimate, 0)::numeric                       AS floor_val,
    COALESCE(r.risk_rating, 50)::numeric                                   AS risk_pct,
    COALESCE(r.value_score, 0)::numeric                                    AS val_score,
    COALESCE(r.neeko_rating, 0)::numeric                                   AS neeko_r,
    COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric            AS neeko_scaled,
    COALESCE(r.consistency_tier, 'Variable')                               AS cons_tier,
    COALESCE(r.projection_confidence, 50)::numeric                         AS confidence,
    r.value_tag, r.matchup_rating AS matchup_lbl,
    r.ai_recommendation, r.market_watch_category AS rc_mw_cat,
    r.recommendation_short,
    COALESCE(l.last3_avg, r.projection_final::numeric, 0)                  AS last3_avg_calc,
    COALESCE(gc.games_played, 0)                                           AS games_played
  FROM afl.player_rankings_cache r
  LEFT JOIN last3       l  ON l.player_id  = r.player_id
  LEFT JOIN games_count gc ON gc.player_id = r.player_id
  LEFT JOIN season_avg  sa ON sa.player_id = r.player_id
  LEFT JOIN afl.player_prices pp ON pp.player_id = r.player_id
    AND pp.season = v_season
    AND pp.round_number = 0
  WHERE r.player_id IS NOT NULL
    AND COALESCE(r.price, 0) > 0
    AND COALESCE(r.projection_final, r.projection, 0) > 0
    AND NOT (COALESCE(r.price, 0) <= 250000 AND COALESCE(gc.games_played, 0) = 0)
    AND COALESCE(r.status, '') NOT IN ('retired', 'inactive')
    AND COALESCE(r.manual_status, '') NOT IN ('retired', 'inactive')
),
valued AS (
  SELECT *,
    CASE WHEN price > 0 THEN ROUND((proj / (price / 100000.0)) * 10, 2) ELSE 0 END AS value_ratio
    -- REMOVED: be_score calculation (now using actual breakeven from base CTE)
  FROM base
),
categorised AS (
  SELECT *,
    CASE
      WHEN val_score >= v_vs_p90 AND neeko_r >= v_nr_p85 AND price < 400000 THEN 'cash_cow'
      WHEN val_score >= v_vs_p75 AND neeko_r >= v_nr_p40 AND proj >= v_proj_p60 THEN 'buy_before_rise'
      WHEN neeko_r >= v_nr_p85 AND proj >= v_proj_p75 AND price >= 400000 THEN 'upgrade_target'
      WHEN val_score <= v_vs_p10 AND neeko_r < v_nr_p40 THEN 'fade_trap'
      WHEN val_score <= v_vs_p25 OR (risk_pct > 65 AND neeko_r < v_nr_p40) THEN 'sell_before_drop'
      ELSE 'monitor'
    END AS mw_category,
    CASE
      WHEN val_score >= v_vs_p75 AND neeko_r >= v_nr_p40 THEN 'BUY'
      WHEN val_score <= v_vs_p25 OR risk_pct > 65       THEN 'SELL'
      ELSE 'HOLD'
    END AS trade_action
  FROM valued
)
SELECT
  v_snapshot_id,
  c.player_id, c.player_name, c.team, c.position,
  c.price, c.prev_price, c.price_change_pct,
  c.proj,
  ROUND(c.breakeven, 0)::integer AS breakeven, -- Use actual season average, rounded to whole number
  c.ceiling_val, c.risk_pct,
  ROUND(c.val_score - 100, 1)        AS price_edge_pts,
  ROUND((c.proj - c.breakeven) * 800) AS expected_price_change,
  c.mw_category, c.trade_action,
  ROUND(
    CASE c.mw_category
      WHEN 'cash_cow'         THEN (c.val_score * 0.5 + c.neeko_r * 0.3 + c.confidence * 0.2)
      WHEN 'buy_before_rise'  THEN (c.val_score * 0.4 + c.neeko_r * 0.4 + c.confidence * 0.2)
      WHEN 'upgrade_target'   THEN (c.neeko_r   * 0.5 + c.val_score * 0.3 + c.confidence * 0.2)
      WHEN 'sell_before_drop' THEN (100 - c.val_score) * 0.6 + c.risk_pct * 0.4
      WHEN 'fade_trap'        THEN (100 - c.val_score) * 0.5 + c.risk_pct * 0.5
      ELSE c.val_score * 0.4 + c.neeko_r * 0.4 + c.confidence * 0.2
    END
  , 1) AS trade_score,
  to_jsonb(ARRAY[c.value_tag, c.matchup_lbl, c.recommendation_short]) AS reasons,
  ROUND(c.price * 1.05) AS projected_price,
  ROUND(c.price * 1.03) AS projected_price_r1,
  ROUND(c.price * 1.05) AS projected_price_r2,
  ROUND(c.price * 1.08) AS projected_price_r3,
  GREATEST(0, ROUND(c.val_score - 80, 1)) AS breakout_score,
  (c.val_score > v_vs_p90 AND c.neeko_r > v_nr_p85) AS breakout_flag,
  c.risk_pct AS volatility_score,
  CASE WHEN c.risk_pct >= 70 THEN 'High' WHEN c.risk_pct >= 50 THEN 'Medium' ELSE 'Low' END AS volatility_level,
  c.last3_avg_calc,
  c.price AS estimated_price,
  c.val_score,
  ROUND(c.price * 1.10) AS price_range_top,
  ROUND(c.price * 0.92) AS price_range_bottom,
  ROUND(c.val_score - 100, 1) AS value_momentum,
  CASE WHEN c.val_score > 110 THEN 'Rising' WHEN c.val_score < 90 THEN 'Falling' ELSE 'Stable' END AS momentum_label,
  c.price AS peak_price,
  0::integer AS peak_round,
  'current'::text AS peak_status,
  CASE WHEN c.trade_action = 'BUY'  THEN ROUND(c.val_score * 0.6 + c.neeko_r * 0.4, 1) ELSE 0 END AS buy_score,
  CASE WHEN c.trade_action = 'SELL' THEN ROUND((100 - c.val_score) * 0.6 + c.risk_pct * 0.4, 1) ELSE 0 END AS sell_score,
  CASE WHEN c.trade_action = 'HOLD' THEN ROUND(c.neeko_r * 0.5 + c.val_score * 0.5, 1) ELSE 0 END AS hold_score,
  0::numeric AS watch_score
FROM categorised c
ORDER BY trade_score DESC;

END;
$function$;
