/*
  # Fix Breakeven Step 3 — Snapshot function reads BE from cache

  The market.build_market_watch_snapshot() function was computing:
    GREATEST(0, ROUND(price / 7200.0))::integer AS breakeven

  This is an independent calculation that diverges from the stabilised
  value in afl.player_rankings_cache.

  Fix: read rc.breakeven directly from cache (already stabilised).

  After this fix, all 4 pages use ONE breakeven value:
    Rankings  → cache.breakeven
    Player    → cache.breakeven
    Teams     → cache.breakeven (via get_team_players_safe)
    Market Watch → cache.breakeven (via snapshot → cache)
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_season      int;
v_round       int;
v_snapshot_id uuid;
BEGIN

SELECT season, MAX(week)
INTO v_season, v_round
FROM afl.player_games
GROUP BY season
ORDER BY season DESC
LIMIT 1;

IF v_season IS NULL THEN
v_season := 2026;
v_round  := 1;
END IF;

UPDATE market.market_watch_snapshot SET is_active = false;

INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
VALUES (v_season, v_round, true)
ON CONFLICT (season, round_number) DO UPDATE
SET updated_at = now(), is_active = true
RETURNING snapshot_id INTO v_snapshot_id;

DELETE FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id;

INSERT INTO market.market_watch_snapshot_players (
snapshot_id, player_id, player_name, team, position, price, prev_price, price_change_pct,
projection, breakeven, ceiling, risk_pct, price_edge_pts, expected_price_change,
category, action, trade_score, reasons, projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
breakout_score, breakout_flag, volatility_score, volatility_level,
last3_avg, estimated_price, value_score, price_range_top, price_range_bottom, value_momentum, momentum_label,
peak_price, peak_round, peak_status, buy_score, sell_score, hold_score, watch_score
)
SELECT
v_snapshot_id,
rc.player_id,
rc.player_name,
rc.team,
rc.position,
COALESCE(rc.price, 0)                                                         AS price,
COALESCE(rc.prev_price, rc.price, 0)::integer                                 AS prev_price,
COALESCE(rc.price_change_pct, 0)::numeric                                     AS price_change_pct,
COALESCE(rc.projection_final, rc.projection, 0)::numeric                      AS projection,
-- CANONICAL: read from cache (stabilised formula), cast to integer for storage
GREATEST(0, ROUND(COALESCE(rc.breakeven, 0)))::integer                        AS breakeven,
COALESCE(rc.ceiling, rc.projection_final, rc.projection, 0)::numeric          AS ceiling,
COALESCE(rc.risk_rating, 50)::numeric                                         AS risk_pct,
-- price_edge = projection minus breakeven (both from cache)
ROUND(
  COALESCE(rc.projection_final, 0)::numeric
  - COALESCE(rc.breakeven, 0)::numeric
, 1)                                                                          AS price_edge_pts,
0                                                                             AS expected_price_change,
COALESCE(rc.ai_recommendation, 'HOLD')                                        AS category,
COALESCE(rc.ai_recommendation, 'HOLD')                                        AS action,
COALESCE(rc.value_score, 0)::numeric                                          AS trade_score,
jsonb_build_array(COALESCE(rc.recommendation_short, 'No analysis'))::jsonb    AS reasons,
COALESCE(rc.price, 0)                                                         AS projected_price,
COALESCE(rc.price, 0)                                                         AS projected_price_r1,
COALESCE(rc.price, 0)                                                         AS projected_price_r2,
COALESCE(rc.price, 0)                                                         AS projected_price_r3,
0                                                                             AS breakout_score,
false                                                                         AS breakout_flag,
COALESCE(rc.risk_rating, 50)::numeric                                         AS volatility_score,
CASE
WHEN COALESCE(rc.risk_rating, 50) >= 70 THEN 'High'
WHEN COALESCE(rc.risk_rating, 50) >= 40 THEN 'Medium'
ELSE 'Low'
END                                                                           AS volatility_level,
COALESCE(rc.projection_final, rc.projection, 0)::numeric                      AS last3_avg,
COALESCE(rc.price, 0)                                                         AS estimated_price,
COALESCE(rc.value_score, 0)::numeric                                          AS value_score,
COALESCE(rc.ceiling, rc.projection_final, rc.projection, 0)::numeric          AS price_range_top,
GREATEST(
  COALESCE(rc.projection_final, rc.projection, 0) * 0.8,
  COALESCE(rc.breakeven, 0) * 7200.0 * 0.9
)                                                                             AS price_range_bottom,
0                                                                             AS value_momentum,
'Stable'                                                                      AS momentum_label,
COALESCE(rc.price, 0)                                                         AS peak_price,
v_round                                                                       AS peak_round,
'Current'                                                                     AS peak_status,
CASE WHEN COALESCE(rc.ai_recommendation, 'HOLD') = 'BUY'  THEN COALESCE(rc.value_score, 0) ELSE 0 END  AS buy_score,
CASE WHEN COALESCE(rc.ai_recommendation, 'HOLD') = 'SELL' THEN ABS(COALESCE(rc.value_score, 0)) ELSE 0 END AS sell_score,
CASE WHEN COALESCE(rc.ai_recommendation, 'HOLD') = 'HOLD' THEN 50 ELSE 0 END AS hold_score,
COALESCE(rc.value_score, 0)::numeric                                          AS watch_score
FROM afl.player_rankings_cache rc
LEFT JOIN afl.players p ON p.player_id = rc.player_id
WHERE
rc.player_id IS NOT NULL
AND COALESCE(rc.price, 0) > 0
AND COALESCE(rc.projection_final, rc.projection, 0) > 0
AND COALESCE(p.active, true) = true
AND (rc.manual_status IS NULL OR rc.manual_status NOT IN ('RETIRED', 'injured', 'out', 'suspended'))
AND rc.ai_recommendation IN ('BUY', 'HOLD', 'SELL')
ORDER BY rc.value_score DESC NULLS LAST;

UPDATE market.market_watch_snapshot
SET
total_player_count = (
SELECT COUNT(*) FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id
),
buy_category_pct = (
SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE action = 'BUY') / NULLIF(COUNT(*), 0), 1)
FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id
),
sell_category_pct = (
SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE action = 'SELL') / NULLIF(COUNT(*), 0), 1)
FROM market.market_watch_snapshot_players
WHERE snapshot_id = v_snapshot_id
),
distribution_valid = true,
updated_at = now()
WHERE snapshot_id = v_snapshot_id;

END;
$function$;

-- Rebuild snapshot immediately so MW uses new BE values
SELECT market.build_market_watch_snapshot();
