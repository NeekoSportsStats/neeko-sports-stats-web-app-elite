/*
  # Fix Market Watch - Include Bye and Injured Players

  ## Summary
  Updates Market Watch to SHOW bye and injured players (not exclude them).
  Adds status/manual_status fields to views so frontend can display status pills.

  ## Problem
  - Current logic excludes bye players entirely (line 147)
  - Forces unavailable players into SELL categories
  - Users can't see injured/bye players to make SELL decisions

  ## Solution
  - REMOVE bye exclusion filter
  - KEEP injured/bye players in their natural categories
  - ADD status fields to views for frontend display
  - Let frontend show status pills (BYE/INJ)

  ## Changes
  1. Remove `COALESCE(r.is_bye, false) = false` filter from base CTE
  2. Simplify availability logic - don't force unavailable players into SELL
  3. Add status, manual_status, is_bye to v_mw_free
  4. Already exists in v_mw_premium (confirmed)

  ## Design Decision
  - Injured players CAN be BUY targets (trade opportunity before drop)
  - Bye players CAN be SELL signals (short-term decision)
  - Retired/inactive players still excluded (not fantasy relevant)
*/

-- Step 1: Update snapshot function to include bye/injured players
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

-- Percentiles from ALL players (including bye/injured for fair baseline)
-- Only exclude inactive/retired for percentile calculation
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
base AS (
  SELECT
    r.player_id, r.player_name, r.team, r.position,
    COALESCE(r.price, 0)::numeric                                          AS price,
    r.prev_price::integer                                                  AS prev_price,
    r.price_change_pct::numeric                                            AS price_change_pct,
    COALESCE(r.projection_final, r.projection, 0)::numeric                AS proj,
    ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)                      AS breakeven,
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
  WHERE r.player_id IS NOT NULL
    AND COALESCE(r.price, 0) > 0
    AND COALESCE(r.projection_final, r.projection, 0) > 0
    -- Exclude rookie base prices with no games
    AND NOT (COALESCE(r.price, 0) <= 250000 AND COALESCE(gc.games_played, 0) = 0)
    -- ONLY exclude retired/inactive (NOT bye or injured)
    AND COALESCE(r.status, '') NOT IN ('retired', 'inactive')
    AND COALESCE(r.manual_status, '') NOT IN ('retired', 'inactive')
),
valued AS (
  SELECT *,
    CASE WHEN price > 0 THEN ROUND((proj / (price / 100000.0)) * 10, 2) ELSE 0 END AS value_ratio,
    CASE WHEN price > 0 THEN ROUND(price / 7200.0, 1) ELSE 0 END AS be_score
  FROM base
),
categorised AS (
  SELECT *,
    -- Categorize based on value/projection (NOT availability)
    CASE
      WHEN val_score >= v_vs_p90 AND neeko_r >= v_nr_p85 AND price < 400000 THEN 'cash_cow'
      WHEN val_score >= v_vs_p75 AND neeko_r >= v_nr_p40 AND proj >= v_proj_p60 THEN 'buy_before_rise'
      WHEN neeko_r >= v_nr_p85 AND proj >= v_proj_p75 AND price >= 400000 THEN 'upgrade_target'
      WHEN val_score <= v_vs_p10 AND neeko_r < v_nr_p40 THEN 'fade_trap'
      WHEN val_score <= v_vs_p25 OR (risk_pct > 65 AND neeko_r < v_nr_p40) THEN 'sell_before_drop'
      ELSE 'monitor'
    END AS mw_category,
    -- Trade action based on value (NOT availability)
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
  c.proj, c.be_score, c.ceiling_val, c.risk_pct,
  ROUND(c.val_score - 100, 1)        AS price_edge_pts,
  ROUND((c.proj - c.be_score) * 800) AS expected_price_change,
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

-- Step 2: Update v_mw_free to include status fields
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE OR REPLACE VIEW market.v_mw_free
WITH (security_invoker=off)
AS
WITH ranked_players AS (
  SELECT
    sp.*,
    rc.ai_recommendation,
    rc.recommendation_short,
    rc.summary_short,
    rc.summary_long,
    rc.matchup_label,
    rc.consistency,
    rc.projection_confidence,
    rc.neeko_rating,
    rc.status,
    rc.manual_status,
    rc.is_bye,
    s.updated_at as snapshot_updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY sp.action
      ORDER BY
        CASE sp.action
          WHEN 'TARGET' THEN sp.value_score
          WHEN 'AVOID' THEN -sp.value_score
          WHEN 'WATCH' THEN -ABS(COALESCE(sp.value_score, 0))
          ELSE sp.value_score
        END DESC,
        sp.projection DESC
    ) as rank_in_category
  FROM market.market_watch_snapshot_players sp
  INNER JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE s.is_active = true
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
  status,
  manual_status,
  is_bye,
  snapshot_updated_at
FROM ranked_players
WHERE rank_in_category <= 3
ORDER BY
  CASE action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
  END,
  rank_in_category;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;
