
/*
  # Market Watch Signal Rebalance

  SAFE MODE — no tables dropped, no snapshot data deleted.

  Changes:
  1. Rebuilds market.build_market_watch_snapshot() with:
     - projection >= 65 filter (removes low-value noise)
     - Rebalanced 6-tier category logic (buy, sell_now, sell_consider, cash_cow, fade, hold)
     - Corrected action labels (BUY / SELL / AVOID / HOLD)
  2. Creates/replaces curated frontend views capped per section:
     - market.v_mw_buy_targets      (6)
     - market.v_mw_sell_now         (6)
     - market.v_mw_sell_consider    (8)
     - market.v_mw_cash_cows        (10)
     - market.v_mw_fade             (8)
     - market.v_mw_best_trades      (5)
     - market.v_mw_summary_cards    (1 row — hero stats, drop+recreate to rename columns)

  Total visible players ≈ 30. Scroll fatigue eliminated.
*/

-- ── STEP 1: Rebuild snapshot function with rebalanced signal logic ─────────────

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = market, public, afl
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(round_number)
  INTO   v_season, v_round
  FROM   afl.v_player_round_projections_2026
  GROUP  BY season
  ORDER  BY season DESC
  LIMIT  1;

  IF v_season IS NULL THEN
    RAISE NOTICE 'market.build_market_watch_snapshot: no projection data found, aborting.';
    RETURN;
  END IF;

  INSERT INTO market.market_watch_snapshot (season, round_number)
  VALUES (v_season, v_round)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(),
        is_active  = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  -- ── STEP 2: Player data with rebalanced category logic ─────────────────────

  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    projection,
    breakeven,
    ceiling,
    risk_pct,
    price_edge_pts,
    expected_price_change,
    category,
    action,
    trade_score,
    reasons
  )
  WITH base AS (
    SELECT
      r.player_id,
      r.player_name,
      r.team,
      r.position,
      r.price,
      COALESCE(p.projected_score, r.projection_final)             AS projection,
      ROUND((r.price::numeric / 2500.0), 1)                       AS breakeven,
      COALESCE(p.ceiling_fantasy, r.ceiling_estimate)             AS ceiling,
      COALESCE(r.risk_rating, 50)                                 AS risk_pct,
      r.value_tier,
      r.value_tag,
      r.value_score,
      r.neeko_rating,
      r.consistency_tier,
      p.matchup_label,
      p.prob_100_plus
    FROM public.v_rankings_with_value r
    LEFT JOIN afl.v_player_round_projections_2026 p
      ON  p.player        = r.player_name
      AND p.season        = v_season
      AND p.round_number  = v_round
    WHERE r.player_id IS NOT NULL
      AND r.price       IS NOT NULL
      AND COALESCE(p.projected_score, r.projection_final) >= 65
  ),
  categorised AS (
    SELECT
      *,
      ROUND(projection - breakeven, 1)                  AS price_edge,
      ROUND((projection - breakeven) * 2500.0)          AS expected_price_change_calc,
      CASE
        WHEN (projection - breakeven) >= 5
         AND risk_pct <= 60                             THEN 'buy'
        WHEN (projection - breakeven) <= -12
         AND price >= 600000                            THEN 'sell_now'
        WHEN (projection - breakeven) <= -5            THEN 'sell_consider'
        WHEN price <= 400000
         AND projection >= breakeven                   THEN 'cash_cow'
        WHEN risk_pct >= 70
         AND price >= 500000                           THEN 'fade'
        ELSE 'hold'
      END                                               AS cat
    FROM base
  )
  SELECT
    v_snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    projection,
    breakeven,
    ceiling,
    risk_pct,
    price_edge                                          AS price_edge_pts,
    expected_price_change_calc                          AS expected_price_change,
    cat                                                 AS category,
    CASE
      WHEN cat = 'buy'          THEN 'BUY'
      WHEN cat IN ('sell_now', 'sell_consider') THEN 'SELL'
      WHEN cat = 'cash_cow'     THEN 'BUY'
      WHEN cat = 'fade'         THEN 'AVOID'
      ELSE 'HOLD'
    END                                                 AS action,
    ROUND(
      projection
      + COALESCE(ceiling, 0)
      - risk_pct
    , 1)                                               AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      value_score,
      'neeko_rating',     neeko_rating,
      'consistency_tier', consistency_tier,
      'matchup_label',    matchup_label,
      'prob_100_plus',    prob_100_plus
    )                                                   AS reasons
  FROM categorised;

  -- ── STEP 3: Best trades ─────────────────────────────────────────────────────

  DELETE FROM market.market_watch_best_trades
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO market.market_watch_best_trades (
    snapshot_id,
    out_player_id,
    in_player_id,
    projected_points_gain,
    expected_price_gain,
    risk_change,
    confidence
  )
  SELECT
    v_snapshot_id,
    sell.player_id,
    buy.player_id,
    ROUND(buy.projection - sell.projection, 1),
    buy.expected_price_change,
    ROUND(sell.risk_pct - buy.risk_pct, 1),
    ROUND(100.0 - buy.risk_pct, 1)
  FROM market.market_watch_snapshot_players buy
  JOIN market.market_watch_snapshot_players sell
    ON  buy.snapshot_id = sell.snapshot_id
    AND buy.position    = sell.position
  WHERE buy.snapshot_id  = v_snapshot_id
    AND sell.snapshot_id = v_snapshot_id
    AND buy.category     = 'buy'
    AND sell.category    IN ('sell_now', 'sell_consider')
    AND buy.player_id   <> sell.player_id
  ORDER BY (buy.projection - sell.projection) DESC
  LIMIT 10;

  RAISE NOTICE 'market.build_market_watch_snapshot: snapshot % built for season % round %',
    v_snapshot_id, v_season, v_round;

END;
$$;

GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;

-- ── STEP 4: Curated frontend views ────────────────────────────────────────────

CREATE OR REPLACE VIEW market.v_mw_buy_targets AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'buy'
  AND projection >= 65
ORDER BY trade_score DESC
LIMIT 6;

CREATE OR REPLACE VIEW market.v_mw_sell_now AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'sell_now'
ORDER BY trade_score ASC
LIMIT 6;

CREATE OR REPLACE VIEW market.v_mw_sell_consider AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'sell_consider'
ORDER BY trade_score ASC
LIMIT 8;

CREATE OR REPLACE VIEW market.v_mw_cash_cows AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'cash_cow'
ORDER BY expected_price_change DESC
LIMIT 10;

CREATE OR REPLACE VIEW market.v_mw_fade AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'fade'
ORDER BY risk_pct DESC
LIMIT 8;

CREATE OR REPLACE VIEW market.v_mw_best_trades AS
SELECT *
FROM market.market_watch_best_trades
ORDER BY projected_points_gain DESC
LIMIT 5;

-- Drop and recreate summary view to allow column rename
DROP VIEW IF EXISTS market.v_mw_summary_cards;

CREATE VIEW market.v_mw_summary_cards AS
SELECT
  (
    SELECT player_name
    FROM market.market_watch_snapshot_players
    WHERE category = 'buy'
    ORDER BY trade_score DESC
    LIMIT 1
  ) AS best_buy,
  (
    SELECT player_name
    FROM market.market_watch_snapshot_players
    WHERE category = 'cash_cow'
    ORDER BY expected_price_change DESC
    LIMIT 1
  ) AS best_cash_cow,
  (
    SELECT player_name
    FROM market.market_watch_snapshot_players
    WHERE category = 'fade'
    ORDER BY risk_pct DESC
    LIMIT 1
  ) AS biggest_trap;

GRANT SELECT ON market.v_mw_buy_targets     TO anon, authenticated;
GRANT SELECT ON market.v_mw_sell_now        TO anon, authenticated;
GRANT SELECT ON market.v_mw_sell_consider   TO anon, authenticated;
GRANT SELECT ON market.v_mw_cash_cows       TO anon, authenticated;
GRANT SELECT ON market.v_mw_fade            TO anon, authenticated;
GRANT SELECT ON market.v_mw_best_trades     TO anon, authenticated;
GRANT SELECT ON market.v_mw_summary_cards   TO anon, authenticated;
