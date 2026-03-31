/*
  # Trade Engine V2b — Dual-Side Diversity

  ## Summary
  Extends the previous diversity fix to also deduplicate on the sell side.
  Without this, a single top sell candidate (e.g. Adam Treloar) floods the list.

  ## Changes
  - Adds a second ROW_NUMBER window: PARTITION BY sell_player_id
  - Final output: each sell player appears at most once AND each buy player appears at most once
  - This is achieved by ranking both dimensions and selecting the best non-overlapping pairs
  - Strategy: rank by buy_player_id first (keeps best sell per buy), then pick top-N by trade_score
    ensuring each sell_player_id appears at most once using a second filter pass
*/

DROP VIEW IF EXISTS market.v_trade_best CASCADE;
DROP VIEW IF EXISTS market.v_trade_recommendations CASCADE;

CREATE OR REPLACE VIEW market.v_trade_recommendations AS
WITH active_snap AS (
  SELECT snapshot_id
  FROM market.market_watch_snapshot
  WHERE is_active = true
  LIMIT 1
),
sell_candidates AS (
  SELECT
    p.player_id             AS sell_player_id,
    p.player_name           AS sell_player_name,
    p.team                  AS sell_team,
    p.position              AS sell_position,
    p.price                 AS sell_price,
    p.projection            AS sell_projection,
    p.breakeven             AS sell_breakeven,
    p.expected_price_change AS sell_epc,
    p.value_score           AS sell_value_score,
    p.category              AS sell_category
  FROM market.market_watch_snapshot_players p
  JOIN active_snap s ON s.snapshot_id = p.snapshot_id
  WHERE p.category = ANY (ARRAY['sell_before_drop', 'fade_trap'])
  LIMIT 40
),
buy_candidates AS (
  SELECT
    p.player_id             AS buy_player_id,
    p.player_name           AS buy_player_name,
    p.team                  AS buy_team,
    p.position              AS buy_position,
    p.price                 AS buy_price,
    p.projection            AS buy_projection,
    p.breakeven             AS buy_breakeven,
    p.expected_price_change AS buy_epc,
    p.value_score           AS buy_value_score,
    p.category              AS buy_category
  FROM market.market_watch_snapshot_players p
  JOIN active_snap s ON s.snapshot_id = p.snapshot_id
  WHERE p.category = ANY (ARRAY['upgrade_target', 'buy_before_rise'])
    AND p.price > 250000
  LIMIT 40
),
trade_pairs AS (
  SELECT
    s.sell_player_id,
    s.sell_player_name,
    s.sell_team,
    s.sell_position,
    s.sell_price,
    s.sell_projection,
    s.sell_category,
    s.sell_value_score,
    b.buy_player_id,
    b.buy_player_name,
    b.buy_team,
    b.buy_position,
    b.buy_price,
    b.buy_projection,
    b.buy_category,
    b.buy_value_score,
    s.sell_price - b.buy_price                       AS cash_delta,
    b.buy_projection - s.sell_projection             AS projection_gain,
    ROUND(
      (b.buy_projection - s.sell_projection) * 4.0
      + (s.sell_price - b.buy_price) / 2000.0
      + COALESCE(b.buy_value_score, 0) * 2.0
      + COALESCE(s.sell_value_score, 0) * -1.0
    )                                                AS trade_score,
    CASE
      WHEN (s.sell_price - b.buy_price) > 200000     THEN 'CASH_GENERATION'
      WHEN (b.buy_projection - s.sell_projection) > 10 THEN 'AGGRESSIVE_UPGRADE'
      ELSE 'BALANCED'
    END                                              AS trade_type
  FROM sell_candidates s
  CROSS JOIN buy_candidates b
  WHERE b.buy_player_id <> s.sell_player_id
    AND (b.buy_projection - s.sell_projection) > 3
    AND b.buy_projection >= s.sell_projection + 3
    AND (s.sell_price - b.buy_price) > -150000
),
-- Best trade per buy player (each buy target appears at most once)
best_per_buy AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY buy_player_id ORDER BY trade_score DESC) AS buy_rn
  FROM trade_pairs
),
filtered_buy AS (
  SELECT * FROM best_per_buy WHERE buy_rn = 1
),
-- Best trade per sell player from remaining pairs (each sell target appears at most once)
best_per_sell AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY sell_player_id ORDER BY trade_score DESC) AS sell_rn
  FROM filtered_buy
)
SELECT
  sell_player_id,
  sell_player_name,
  sell_team,
  sell_position,
  sell_price,
  sell_projection,
  sell_category,
  buy_player_id,
  buy_player_name,
  buy_team,
  buy_position,
  buy_price,
  buy_projection,
  buy_category,
  cash_delta,
  projection_gain,
  trade_score,
  trade_type
FROM best_per_sell
WHERE sell_rn = 1
ORDER BY trade_score DESC
LIMIT 30;


CREATE OR REPLACE VIEW market.v_trade_best AS
SELECT
  sell_player_id,
  sell_player_name,
  sell_team,
  sell_position,
  sell_price,
  sell_projection,
  sell_category,
  buy_player_id,
  buy_player_name,
  buy_team,
  buy_position,
  buy_price,
  buy_projection,
  buy_category,
  cash_delta,
  projection_gain,
  trade_score,
  trade_type
FROM market.v_trade_recommendations
WHERE projection_gain > 5
ORDER BY trade_score DESC
LIMIT 1;
