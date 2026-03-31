
/*
  # Market Watch V2 — Snapshot Automation

  Creates a stored procedure that builds the weekly market watch snapshot
  from real projection and pricing data, plus a pg_cron job to run it
  every Monday at 05:00 UTC.

  1. Function: market.build_market_watch_snapshot()
    - Determines current season/round from afl.v_player_round_projections_2026
    - Inserts (or skips if already exists) a snapshot row
    - Populates player data from v_rankings_with_value joined to projections
    - Generates top-10 best trade pairs (SELL → BUY, same position)

  2. Cron: market_watch_weekly
    - Runs every Monday at 05:00 UTC
    - Safe to run multiple times (upserts snapshot, skips existing)
*/

-- ── STEP 1: Snapshot function ─────────────────────────────────────────────────

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

  -- Derive current season/round from the latest projection round available
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

  -- Insert snapshot (skip if already exists for this season/round)
  INSERT INTO market.market_watch_snapshot (season, round_number)
  VALUES (v_season, v_round)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(),
        is_active  = true
  RETURNING snapshot_id INTO v_snapshot_id;

  -- Clear stale player rows for this snapshot before repopulating
  DELETE FROM market.market_watch_snapshot_players
  WHERE  snapshot_id = v_snapshot_id;

  -- ── STEP 2: Insert player data ──────────────────────────────────────────────
  -- Source: v_rankings_with_value (has price, risk, ratings) joined to
  --         v_player_round_projections_2026 (has projection, ceiling, floor)

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
  SELECT
    v_snapshot_id,
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.price,
    COALESCE(p.projected_score, r.projection_final)             AS projection,
    -- Breakeven estimate: price / 2500 (standard AFL fantasy formula)
    ROUND((r.price::numeric / 2500.0), 1)                       AS breakeven,
    COALESCE(p.ceiling_fantasy, r.ceiling_estimate)             AS ceiling,
    COALESCE(r.risk_rating, 50)                                 AS risk_pct,
    -- Price edge = projection minus breakeven
    ROUND(
      COALESCE(p.projected_score, r.projection_final)
      - (r.price::numeric / 2500.0),
    1)                                                          AS price_edge_pts,
    -- Expected price change (pts above breakeven × $2500 per point)
    ROUND(
      (COALESCE(p.projected_score, r.projection_final)
       - (r.price::numeric / 2500.0)) * 2500.0
    )                                                           AS expected_price_change,
    -- Category matches value_tier from rankings
    COALESCE(r.value_tier, 'neutral')                           AS category,
    -- Action derived from price_edge_pts
    CASE
      WHEN COALESCE(p.projected_score, r.projection_final)
           - (r.price::numeric / 2500.0) >= 10  THEN 'BUY'
      WHEN COALESCE(p.projected_score, r.projection_final)
           - (r.price::numeric / 2500.0) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END                                                         AS action,
    -- Trade score: projection + ceiling - risk (higher = more attractive)
    ROUND(
      COALESCE(p.projected_score, r.projection_final)
      + COALESCE(p.ceiling_fantasy, r.ceiling_estimate, 0)
      - COALESCE(r.risk_rating, 50)
    , 1)                                                        AS trade_score,
    -- Reasons JSON for frontend display
    jsonb_build_object(
      'value_tag',        r.value_tag,
      'value_score',      r.value_score,
      'neeko_rating',     r.neeko_rating,
      'consistency_tier', r.consistency_tier,
      'matchup_label',    p.matchup_label,
      'prob_100_plus',    p.prob_100_plus
    )                                                           AS reasons
  FROM public.v_rankings_with_value r
  LEFT JOIN afl.v_player_round_projections_2026 p
    ON  p.player   = r.player_name
    AND p.season   = v_season
    AND p.round_number = v_round
  WHERE r.player_id IS NOT NULL
    AND r.price IS NOT NULL;

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
    ROUND(buy.projection - sell.projection, 1)  AS projected_points_gain,
    buy.expected_price_change                   AS expected_price_gain,
    ROUND(sell.risk_pct - buy.risk_pct, 1)      AS risk_change,
    ROUND(100.0 - buy.risk_pct, 1)              AS confidence
  FROM market.market_watch_snapshot_players buy
  JOIN market.market_watch_snapshot_players sell
    ON  buy.snapshot_id = sell.snapshot_id
    AND buy.position    = sell.position
  WHERE buy.snapshot_id  = v_snapshot_id
    AND sell.snapshot_id = v_snapshot_id
    AND buy.action       = 'BUY'
    AND sell.action      = 'SELL'
    AND buy.player_id   <> sell.player_id
  ORDER BY (buy.projection - sell.projection) DESC
  LIMIT 10;

  RAISE NOTICE 'market.build_market_watch_snapshot: snapshot % built for season % round %',
    v_snapshot_id, v_season, v_round;

END;
$$;

GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;

-- ── STEP 4: pg_cron job ───────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing schedule with the same name before re-adding
SELECT cron.unschedule('market_watch_weekly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'market_watch_weekly'
);

SELECT cron.schedule(
  'market_watch_weekly',
  '0 5 * * 1',
  $cron$
    SELECT market.build_market_watch_snapshot();
  $cron$
);
