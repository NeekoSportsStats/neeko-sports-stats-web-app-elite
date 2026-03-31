/*
  # Trade Engine V2d — Full Pool + Ordered Candidates

  ## Summary
  Fixes shallow result set caused by unordered LIMIT 40 on candidate pools.
  Uses full available sell/buy pools with proper ordering.

  ## Changes
  - sell_candidates: ORDER BY expected_price_change ASC (worst first), LIMIT 60
  - buy_candidates: ORDER BY value_score DESC, projection DESC (best buys first), LIMIT 77 (full pool)
  - sell_rn cap raised from 3 to 5 (allows more variety with deeper pools)
  - All other logic unchanged from V2c
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
  ORDER BY p.expected_price_change ASC, p.value_score ASC
  LIMIT 60
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
  ORDER BY p.value_score DESC, p.projection DESC
  LIMIT 77
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
    s.sell_price - b.buy_price                         AS cash_delta,
    b.buy_projection - s.sell_projection               AS projection_gain,
    ROUND(
      (b.buy_projection - s.sell_projection) * 4.0
      + (s.sell_price - b.buy_price) / 2000.0
      + COALESCE(b.buy_value_score, 0) * 2.0
      + COALESCE(s.sell_value_score, 0) * -1.0
    )                                                  AS trade_score,
    CASE
      WHEN (s.sell_price - b.buy_price) > 200000       THEN 'CASH_GENERATION'
      WHEN (b.buy_projection - s.sell_projection) > 10 THEN 'AGGRESSIVE_UPGRADE'
      ELSE 'BALANCED'
    END                                                AS trade_type
  FROM sell_candidates s
  CROSS JOIN buy_candidates b
  WHERE b.buy_player_id <> s.sell_player_id
    AND (b.buy_projection - s.sell_projection) > 3
    AND b.buy_projection >= s.sell_projection + 3
    AND (s.sell_price - b.buy_price) > -150000
),
-- Each buy player appears at most once (best sell pairing wins)
dedup_buy AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY buy_player_id ORDER BY trade_score DESC) AS buy_rn
  FROM trade_pairs
),
unique_buys AS (
  SELECT * FROM dedup_buy WHERE buy_rn = 1
),
-- Each sell player appears at most 5 times to allow variety
sell_capped AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY sell_player_id ORDER BY trade_score DESC) AS sell_rn
  FROM unique_buys
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
FROM sell_capped
WHERE sell_rn <= 5
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
