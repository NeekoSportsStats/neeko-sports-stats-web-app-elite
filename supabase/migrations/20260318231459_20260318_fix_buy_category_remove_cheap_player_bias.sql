/*
  # Fix BUY Category — Remove Cheap Player Bias

  ## Problem
  Minimum-priced players with zero games were dominating the BUY category
  because their breakeven score is very low, making projection vs breakeven
  look great even when they have no meaningful activity.

  ## Changes
  1. Add filter to base CTE: exclude players with price <= 250000 AND games_played = 0
  2. Add filter to BUY category branches: require projection_final >= 60
  3. Add filter to BUY category branches: require value_score > 0

  ## Categories affected
  - BUY: all three BUY branches now require proj >= 60 AND val_score > 0
  - CASH_COW: also requires proj >= 60 AND val_score > 0 (same guard)
  - All other categories (SELL, FADE, MONITOR, TRAP): unchanged

  ## Notes
  - Safe mode: snapshot structure unchanged, no new columns, no data loss
  - games_played derived from afl.player_games count per player in current season
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'public', 'afl'
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
BEGIN

-- ── 1. Determine current season/round ─────────────────────────────────────
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

-- ── 2. Compute live percentiles from rankings cache ────────────────────────
SELECT
COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score), 2.0),
COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value_score), 4.0),
COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value_score), 0.1),
COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score), 0.5),
COALESCE(PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY neeko_rating), 56.0),
COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY neeko_rating), 43.0)
INTO v_vs_p75, v_vs_p90, v_vs_p10, v_vs_p25, v_nr_p85, v_nr_p40
FROM afl.player_rankings_cache
WHERE value_score IS NOT NULL AND neeko_rating IS NOT NULL;

-- ── 3. Deactivate existing snapshots, create new one ──────────────────────
UPDATE market.market_watch_snapshot
SET    is_active = false
WHERE  season = v_season AND round_number = v_round;

INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
VALUES (v_season, v_round, true)
ON CONFLICT (season, round_number) DO UPDATE
SET updated_at = now(),
is_active  = true
RETURNING snapshot_id INTO v_snapshot_id;

DELETE FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id;

-- ── 4. Build snapshot players ──────────────────────────────────────────────
INSERT INTO market.market_watch_snapshot_players (
snapshot_id, player_id, player_name, team, position,
price, projection, breakeven, ceiling, risk_pct,
price_edge_pts, expected_price_change, category, action, trade_score, reasons,
projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
breakout_score, breakout_flag, volatility_score, volatility_level,
last3_avg, estimated_price, value_score,
price_range_top, price_range_bottom, value_momentum, momentum_label,
peak_price, peak_round, peak_status
)
WITH games_count AS (
  -- Count games played per player in current season
  SELECT player_id, COUNT(*) AS games_played
  FROM   afl.player_games
  WHERE  season = v_season
  GROUP  BY player_id
),
last3 AS (
SELECT
player_id,
ROUND(AVG(fantasy_score)::numeric, 1) AS last3_avg
FROM (
SELECT player_id, fantasy_score,
ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
FROM afl.player_games
WHERE season = v_season AND fantasy_score IS NOT NULL
) ranked
WHERE rn <= 3
GROUP BY player_id
),
base AS (
SELECT
r.player_id,
r.player_name,
r.team,
r.position,
COALESCE(r.price, 0)::numeric                                    AS price,
COALESCE(r.projection_final, r.projection, 0)::numeric           AS proj,
ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)                 AS breakeven,
COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
COALESCE(r.floor, r.floor_estimate, 0)::numeric                  AS floor_val,
COALESCE(r.risk_rating, 50)::numeric                             AS risk_pct,
COALESCE(r.value_score, 0)::numeric                              AS val_score,
COALESCE(r.neeko_rating, 0)::numeric                             AS neeko_r,
COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric      AS neeko_scaled,
COALESCE(r.consistency_tier, 'Variable')                         AS cons_tier,
COALESCE(r.projection_confidence, 50)::numeric                   AS confidence,
r.value_tag,
r.matchup_rating                                                  AS matchup_lbl,
r.ai_recommendation,
r.market_watch_category                                           AS rc_mw_cat,
r.recommendation_short,
COALESCE(l.last3_avg, r.projection_final::numeric, 0)            AS last3_avg_calc,
COALESCE(gc.games_played, 0)                                     AS games_played
FROM afl.player_rankings_cache r
LEFT JOIN last3 l ON l.player_id = r.player_id
LEFT JOIN games_count gc ON gc.player_id = r.player_id
WHERE r.player_id IS NOT NULL
AND COALESCE(r.price, 0) > 0
AND COALESCE(r.projection_final, r.projection, 0) > 0
-- STEP 1: Exclude minimum-priced players with zero games
AND NOT (COALESCE(r.price, 0) <= 250000 AND COALESCE(gc.games_played, 0) = 0)
),
valued AS (
SELECT *,
ROUND((proj - breakeven) * 7200.0)          AS exp_price_change,
ROUND(proj - breakeven, 1)                   AS price_edge,
ROUND(proj * 7200)                           AS est_price
FROM base
),
with_momentum AS (
SELECT v.*,
COALESCE(
v.val_score - (
SELECT h.value_score
FROM market.mw_value_history h
WHERE h.player_id = v.player_id AND h.season = v_season
ORDER BY h.round_number DESC LIMIT 1
),
0
)::numeric AS momentum_val
FROM valued v
),
with_projections AS (
SELECT *,
price + COALESCE(exp_price_change, 0)                             AS proj_r1,
price + COALESCE(exp_price_change, 0)
+ COALESCE(exp_price_change, 0) * 0.8                      AS proj_r2,
price + COALESCE(exp_price_change, 0)
+ COALESCE(exp_price_change, 0) * 0.8
+ COALESCE(exp_price_change, 0) * 0.6                      AS proj_r3
FROM with_momentum
),
with_peak AS (
SELECT *,
GREATEST(COALESCE(price,0), COALESCE(proj_r1,0), COALESCE(proj_r2,0), COALESCE(proj_r3,0)) AS peak_p,
CASE
WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r3,-1) THEN 'round_plus_3'
WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r2,-1) THEN 'round_plus_2'
WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r1,-1) THEN 'round_plus_1'
ELSE 'now'
END AS peak_r
FROM with_projections
),
categorised AS (
SELECT *,
CASE peak_r
WHEN 'round_plus_3' THEN 'strong_hold'
WHEN 'round_plus_2' THEN 'hold'
WHEN 'round_plus_1' THEN 'sell_soon'
ELSE 'sell'
END AS peak_st,

-- ── CATEGORY LOGIC ──────────────────────────────────────────────────────
-- STEPS 2 & 3: BUY and CASH_COW require proj >= 60 AND val_score > 0
CASE
-- BUY: projection significantly beats breakeven (positive expected change)
WHEN (proj - breakeven) >= 15 AND val_score >= v_vs_p75
  AND proj >= 60 AND val_score > 0                                 THEN 'buy'
WHEN (proj - breakeven) >= 10 AND val_score >= v_vs_p90
  AND proj >= 60 AND val_score > 0                                 THEN 'buy'
WHEN (proj - breakeven) >= 20
  AND proj >= 60 AND val_score > 0                                 THEN 'buy'

-- CASH COW: cheap player ($150k-$600k) beating breakeven strongly
WHEN price <= 600000 AND (proj - breakeven) >= 10
  AND proj >= 60 AND val_score > 0                                 THEN 'cash_cow'
WHEN price <= 400000 AND (proj - breakeven) >= 5
  AND proj >= 60 AND val_score > 0                                 THEN 'cash_cow'

-- TRAP: expensive player ($700k+) with projection well below breakeven
WHEN price >= 700000 AND (proj - breakeven) <= -30                  THEN 'fade'
WHEN price >= 900000 AND (proj - breakeven) <= -20 AND risk_pct >= 60 THEN 'fade'

-- SELL: projection clearly below breakeven (price will drop)
WHEN (proj - breakeven) <= -20                                       THEN 'sell_now'
WHEN (proj - breakeven) <= -10 AND val_score <= v_vs_p25            THEN 'sell_now'
WHEN (proj - breakeven) <= -5  AND val_score <= v_vs_p10            THEN 'sell_now'

-- SELL CONSIDER: marginally below breakeven
WHEN (proj - breakeven) < 0 AND val_score <= v_vs_p25              THEN 'sell_consider'

ELSE 'monitor'
END AS cat,

-- ── CATEGORY REASON ──────────────────────────────────────────────────────
CASE
WHEN (proj - breakeven) >= 15 AND val_score >= v_vs_p75 THEN
'Projection beats breakeven by ' || ROUND(proj - breakeven, 0)::text || ' pts — price set to rise'
WHEN price <= 600000 AND (proj - breakeven) >= 10 THEN
'Budget player beating breakeven — fast price growth expected'
WHEN price >= 700000 AND (proj - breakeven) <= -30 THEN
'Projection ' || ROUND(ABS(proj - breakeven), 0)::text || ' pts below breakeven — price will drop'
WHEN (proj - breakeven) <= -20 THEN
'Scoring below breakeven — expected price drop of ~' ||
TO_CHAR(ABS(ROUND((proj - breakeven) * 7200)), 'FM$999,999') || ' this round'
WHEN (proj - breakeven) >= 20 THEN
'Strong buy — projection well above breakeven, price rising'
WHEN (proj - breakeven) < 0 THEN
'Below breakeven — hold or consider selling'
ELSE
'Within breakeven range — monitoring this round'
END AS cat_reason,

-- ── MOMENTUM LABEL ───────────────────────────────────────────────────────
CASE
WHEN momentum_val > 3.0  THEN 'rising'
WHEN momentum_val > 1.5  THEN 'improving'
WHEN momentum_val > 0.5  THEN 'stable'
WHEN momentum_val < -3.0 THEN 'falling'
WHEN momentum_val < -1.0 THEN 'cooling'
ELSE 'stable'
END AS mom_label,

-- ── BREAKOUT FLAG ────────────────────────────────────────────────────────
CASE
WHEN proj >= last3_avg_calc * 1.15
AND COALESCE(ceiling_val, 0) >= 110
AND (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) >= 15
AND risk_pct <= 55 THEN true
ELSE false
END AS breakout_flag_calc,

-- ── BREAKOUT SCORE (0–100) ───────────────────────────────────────────────
LEAST(100, GREATEST(0,
ROUND(
neeko_scaled * 0.5
+ CASE WHEN (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) > 0
THEN LEAST(30, (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) * 1.5)
ELSE 0 END
+ CASE WHEN val_score >= v_vs_p90 THEN 20 ELSE 0 END
+ CASE WHEN momentum_val > 1.5 THEN 10 ELSE 0 END
- risk_pct * 0.3
)
)) AS breakout_score_calc,

-- ── VOLATILITY ───────────────────────────────────────────────────────────
LEAST(100,
COALESCE(ceiling_val - floor_val, 0) * (COALESCE(risk_pct, 0) / 100.0)
) AS vol_score

FROM with_peak
),
ranked AS (
SELECT *,
ROUND(
PERCENT_RANK() OVER (
ORDER BY (
COALESCE(proj - breakeven, 0) * 3.0
+ neeko_scaled * 0.40
+ COALESCE(val_score, 0) * 5 * 0.25
+ confidence * 0.10
+ CASE WHEN cat IN ('buy','cash_cow') THEN 20 ELSE 0 END
+ CASE WHEN momentum_val > 1.5 THEN 5 ELSE 0 END
- COALESCE(risk_pct, 50) * 0.15
)
) * 100
)::numeric AS trade_score_pct
FROM categorised
)
SELECT
v_snapshot_id,
player_id, player_name, team, position,
price,
proj                AS projection,
breakeven,
ceiling_val         AS ceiling,
risk_pct,
price_edge          AS price_edge_pts,
exp_price_change    AS expected_price_change,
cat                 AS category,
CASE
WHEN cat = 'buy'                              THEN 'BUY'
WHEN cat = 'cash_cow'                         THEN 'BUY'
WHEN cat IN ('sell_now','sell_consider')      THEN 'SELL'
WHEN cat = 'fade'                             THEN 'AVOID'
ELSE 'HOLD'
END                 AS action,
ROUND(trade_score_pct, 1) AS trade_score,
jsonb_build_object(
'value_tag',        value_tag,
'value_score',      val_score,
'neeko_rating',     neeko_r,
'consistency_tier', cons_tier,
'matchup_label',    matchup_lbl,
'category_reason',  cat_reason,
'confidence',       confidence
)                   AS reasons,
price + COALESCE(exp_price_change, 0)  AS projected_price,
proj_r1             AS projected_price_r1,
proj_r2             AS projected_price_r2,
proj_r3             AS projected_price_r3,
ROUND(breakout_score_calc) AS breakout_score,
breakout_flag_calc  AS breakout_flag,
vol_score           AS volatility_score,
CASE WHEN vol_score >= 60 THEN 'HIGH' WHEN vol_score >= 30 THEN 'MEDIUM' ELSE 'LOW' END AS volatility_level,
last3_avg_calc      AS last3_avg,
est_price           AS estimated_price,
val_score           AS value_score,
ROUND(est_price * 1.10) AS price_range_top,
ROUND(est_price * 0.90) AS price_range_bottom,
momentum_val        AS value_momentum,
mom_label           AS momentum_label,
peak_p              AS peak_price,
peak_r              AS peak_round,
peak_st             AS peak_status
FROM ranked;

-- ── 5. Update value history ────────────────────────────────────────────────
INSERT INTO market.mw_value_history (player_id, round_number, season, value_score, estimated_price, price)
SELECT player_id, v_round, v_season, value_score, estimated_price, price
FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id AND value_score IS NOT NULL
ON CONFLICT (player_id, round_number, season) DO UPDATE
SET value_score     = EXCLUDED.value_score,
estimated_price = EXCLUDED.estimated_price,
price           = EXCLUDED.price,
created_at      = now();

END;
$function$;
