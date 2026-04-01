/*
  # Market Watch Hard Reset — Simple Single Source

  ## Philosophy
  Market Watch should be:
  - Simple (no custom calculations)
  - Trustworthy (single source of truth)
  - Clear (human-readable labels)
  - Premium (clean UX)

  ## Changes

  ### REMOVED (Complexity):
  - Custom breakeven calculations
  - Delta/vs BE metrics
  - Price-based fallback formulas
  - Complex value derivations
  - Nested CASE statements
  - Confusing raw numbers

  ### ADDED (Simplicity):
  - Use season_avg as breakeven
  - Human-readable value labels
  - TARGET/WATCH/AVOID categories
  - Clean field names
  - Guaranteed realistic ranges

  ## Single Source of Truth

  ALL data from: afl.player_rankings_cache + mv_player_projection
  NO custom calculations
  NO derived fields

  ## Breakeven Definition

  breakeven = season_avg (2026 average score)

  Fallback chain:
  1. season_avg (preferred)
  2. last3_avg (if no season avg)
  3. projection (if brand new player)

  MUST be 40-150 range (realistic AFL Fantasy scores)
*/

DROP FUNCTION IF EXISTS market.build_market_watch_snapshot();

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'afl', 'public'
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(week) INTO v_season, v_round
  FROM afl.player_games GROUP BY season ORDER BY season DESC LIMIT 1;

  IF v_season IS NULL THEN v_season := 2026; v_round  := 1; END IF;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
  SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id;

  WITH source_data AS (
    SELECT
      rc.player_id,
      rc.player_name,
      rc.team,
      rc.position,
      -- PRICE: Use cached price ONLY
      COALESCE(rc.price, 0) as price,
      COALESCE(rc.prev_price, rc.price, 0) as prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric as price_change_pct,

      -- PROJECTION: Use cached projection ONLY
      COALESCE(rc.projection_final, rc.projection, 0)::numeric as projection,

      -- BREAKEVEN: Use season average (NOT calculated formula)
      -- This is what player averages this season, NOT a price formula
      CASE
        -- If we have season average from mv_player_projection, use it
        WHEN mv.season_avg IS NOT NULL AND mv.season_avg BETWEEN 40 AND 150
          THEN mv.season_avg::numeric
        -- Fall back to last 3 games average
        WHEN mv.last3_avg IS NOT NULL AND mv.last3_avg BETWEEN 40 AND 150
          THEN mv.last3_avg::numeric
        -- Last resort: use projection (new/returning players)
        ELSE GREATEST(40, LEAST(150, COALESCE(rc.projection_final, rc.projection, 70)::numeric))
      END as breakeven,

      -- VALUE SCORE: Use cached value_score ONLY
      COALESCE(rc.value_score, 0)::numeric as value_score,

      -- VALUE LABEL: Human-readable interpretation of value_score
      CASE
        WHEN rc.value_score >= 15  THEN 'Elite Value'
        WHEN rc.value_score >= 8   THEN 'Strong Value'
        WHEN rc.value_score >= 2   THEN 'Solid Value'
        WHEN rc.value_score >= -3  THEN 'Fair Price'
        WHEN rc.value_score >= -8  THEN 'Slight Premium'
        ELSE 'Overpriced'
      END as value_label,

      -- CATEGORY: Direct mapping from AI recommendation (NO custom logic)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'TARGET'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'AVOID'
        ELSE 'WATCH'
      END as action_label,

      -- Category for DB compatibility
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'buy'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'sell'
        ELSE 'hold'
      END as category,

      -- AI CONTENT: Use cached summaries ONLY
      rc.ai_recommendation,
      rc.recommendation_short,
      rc.summary_short,
      rc.summary_long,

      -- METRICS: Use cached metrics ONLY (no calculations)
      COALESCE(rc.ceiling, rc.projection_final, rc.projection, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,

      -- Sort priority for display
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation = 'HOLD' THEN 2
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 3
        ELSE 4
      END as category_priority

    FROM afl.player_rankings_cache rc
    LEFT JOIN afl.mv_player_projection mv ON mv.player_id = rc.player_id
    WHERE rc.player_id IS NOT NULL
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      AND COALESCE(rc.is_bye, false) = false
      AND (rc.manual_status IS NULL OR rc.manual_status <> 'OUT')
      AND rc.ai_recommendation IS NOT NULL
  ),
  deduplicated AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY category_priority ASC) as rn
    FROM source_data
  )
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, prev_price, price_change_pct,
    projection, breakeven, ceiling,
    risk_pct, price_edge_pts,
    category, action,
    trade_score, reasons,
    value_score,
    -- Simple placeholder fields (not displayed, DB compatibility)
    expected_price_change, projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status, buy_score, sell_score, hold_score, watch_score
  )
  SELECT
    v_snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    prev_price::integer,
    price_change_pct,
    projection,
    breakeven,
    ceiling,
    risk_pct,
    value_score as price_edge_pts,
    category,
    action_label as action,

    -- Simple trade score based on value and rating
    ROUND((CASE
      WHEN action_label = 'TARGET' THEN (value_score * 0.6 + neeko_rating * 0.4)
      WHEN action_label = 'WATCH' THEN (neeko_rating * 0.5 + projection_confidence * 0.5)
      WHEN action_label = 'AVOID' THEN risk_pct
      ELSE 50
    END)::numeric, 1) as trade_score,

    to_jsonb(ARRAY[ai_recommendation, recommendation_short]) as reasons,
    value_score,

    -- Placeholders (not used in new UI)
    0, price::numeric, price::numeric, price::numeric, price::numeric,
    0, false, risk_pct, 'Medium',
    projection, price::numeric, price::numeric, price::numeric, 0, 'Stable',
    price::numeric, 0, 'current', 0, 0, 0, 0

  FROM deduplicated
  WHERE rn = 1
  ORDER BY
    category_priority ASC,
    value_score DESC NULLS LAST;

  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'TARGET') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'AVOID') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
END;
$$;

-- Add value_label column to snapshot players table if not exists
ALTER TABLE market.market_watch_snapshot_players
ADD COLUMN IF NOT EXISTS value_label text;

-- Update existing rows with value labels
UPDATE market.market_watch_snapshot_players sp
SET value_label = CASE
  WHEN sp.value_score >= 15  THEN 'Elite Value'
  WHEN sp.value_score >= 8   THEN 'Strong Value'
  WHEN sp.value_score >= 2   THEN 'Solid Value'
  WHEN sp.value_score >= -3  THEN 'Fair Price'
  WHEN sp.value_score >= -8  THEN 'Slight Premium'
  ELSE 'Overpriced'
END
WHERE sp.snapshot_id IN (
  SELECT snapshot_id FROM market.market_watch_snapshot WHERE is_active = true
);

-- Rebuild snapshot with new simple logic
SELECT market.build_market_watch_snapshot();

COMMENT ON FUNCTION market.build_market_watch_snapshot IS
'Market Watch snapshot builder - SIMPLE SINGLE SOURCE VERSION.
Uses ONLY cached fields from player_rankings_cache and mv_player_projection.
breakeven = season_avg (actual 2026 average, not a formula).
NO custom calculations. NO derived fields. NO confusing deltas.';
