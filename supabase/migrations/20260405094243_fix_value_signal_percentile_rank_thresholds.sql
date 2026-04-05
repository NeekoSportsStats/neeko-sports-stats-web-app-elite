/*
  # Fix value_signal distribution using percentile-rank thresholds

  ## Problem
  The existing value_signal uses absolute edge thresholds (±5, ±15 pts) and value_score
  thresholds (±5, ±15) that are calibrated to a much wider data range than exists in 2026.
  The actual value_score range is -6.5 to +6.71, with the median around -3.75, causing
  87% of players to receive STRONG_SELL regardless of relative standing.

  ## Fix
  Replace absolute thresholds with percentile-rank-based classification so the distribution
  always yields a meaningful mix: ~15% BUY, ~35% HOLD, ~35% WATCH/AVOID-equiv, ~15% SELL.
  The CASE logic ranks each player's value_score within the active player pool and assigns:
    - Top 15% by value_score → BUY
    - Next 20% (p75–p85) → HOLD
    - Middle 30% (p45–p75) → HOLD
    - Next 20% (p25–p45) → SELL
    - Bottom 15% → STRONG_SELL

  Practically: BUY top 15%, HOLD middle 50%, SELL bottom 35% split ~20/15.

  ## Changes
  1. Drops and recreates `fn_compute_value_signal` helper function using percentile ranks
  2. Backfills `value_signal` in `afl.player_rankings_cache` using the new logic
  3. Updates `populate_rankings_cache_from_source` to embed the percentile logic inline

  ## Security
  - All functions use SECURITY DEFINER with explicit search_path
*/

-- ─── Step 1: backfill value_signal in cache using percentile-rank thresholds ──

DO $$
DECLARE
  p_buy   double precision;
  p_sell  double precision;
  p_strong_sell double precision;
BEGIN
  SELECT
    PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY value_score),
    PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY value_score),
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY value_score)
  INTO p_buy, p_sell, p_strong_sell
  FROM afl.player_rankings_cache
  WHERE games_played >= 3
    AND projection_final > 50
    AND value_score IS NOT NULL;

  UPDATE afl.player_rankings_cache
  SET value_signal = CASE
    WHEN value_score IS NULL                THEN 'HOLD'
    WHEN value_score >= p_buy              THEN 'BUY'
    WHEN value_score >= p_sell             THEN 'HOLD'
    WHEN value_score >= p_strong_sell      THEN 'SELL'
    ELSE                                        'STRONG_SELL'
  END
  WHERE games_played >= 3
    AND projection_final > 50;
END $$;

-- ─── Step 2: Exclude injured / bye players from BUY signal ────────────────────

UPDATE afl.player_rankings_cache
SET value_signal = 'HOLD'
WHERE value_signal = 'BUY'
  AND (
    is_bye = true
    OR UPPER(COALESCE(status, ''))        IN ('INJURED', 'OUT', 'OMITTED')
    OR UPPER(COALESCE(manual_status, '')) IN ('INJURED', 'OUT', 'OMITTED')
  );

-- ─── Step 3: Rebuild populate_rankings_cache_from_source with inline percentile ─

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $func$
DECLARE
  p_buy         double precision;
  p_sell        double precision;
  p_strong_sell double precision;
BEGIN

  -- Compute percentile thresholds from projection-eligible players
  SELECT
    PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY
      CASE
        WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played >= 3
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2)
        ELSE NULL
      END
    ),
    PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY
      CASE
        WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played >= 3
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2)
        ELSE NULL
      END
    ),
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY
      CASE
        WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played >= 3
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2)
        ELSE NULL
      END
    )
  INTO p_buy, p_sell, p_strong_sell
  FROM afl.mv_player_projection pp
  WHERE pp.games_played >= 3
    AND pp.projection > 50
    AND pp.is_active = true;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, position,
    price, projection_final, breakeven, games_played,
    season_avg, last3_avg, last5_avg,
    signal, trend_signal, value_score, value_signal,
    edge_score, edge_tier,
    is_bye, status, manual_status,
    summary_short, ai_recommendation, recommendation_color,
    cached_at
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team,
    pp.position,
    pp.price,
    pp.projection        AS projection_final,
    pp.breakeven,
    pp.games_played,
    pp.season_avg,
    pp.last3_avg,
    pp.last5_avg,

    -- signal: trend-based (STRONG_UP/UP/STABLE/DOWN/STRONG_DOWN)
    pp.trend_signal      AS signal,

    -- trend_signal: same column
    pp.trend_signal,

    -- value_score: normalised edge per $100k price
    CASE
      WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played >= 3
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2)
      WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played = 2
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price * 0.6)::numeric, 2)
      WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played = 1
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price * 0.4)::numeric, 2)
      WHEN pp.price > 0 AND pp.breakeven IS NOT NULL
        THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price * 0.25)::numeric, 2)
      ELSE NULL
    END::double precision,

    -- value_signal: percentile-rank based (BUY/HOLD/SELL/STRONG_SELL)
    CASE
      WHEN pp.is_bye = true
        OR UPPER(COALESCE(pp.manual_status, '')) IN ('INJURED', 'OUT', 'OMITTED')
        OR UPPER(COALESCE(pp.status, ''))        IN ('INJURED', 'OUT', 'OMITTED')
        THEN 'HOLD'
      WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played >= 3 THEN
        CASE
          WHEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2) >= p_buy
            THEN 'BUY'
          WHEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2) >= p_sell
            THEN 'HOLD'
          WHEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2) >= p_strong_sell
            THEN 'SELL'
          ELSE 'STRONG_SELL'
        END
      ELSE 'HOLD'
    END,

    -- edge_score and edge_tier (preserve existing logic)
    pp.edge_score,
    pp.edge_tier,

    pp.is_bye,
    pp.status,
    pp.manual_status,

    -- AI fields: preserve from existing cache row if present
    COALESCE(
      (SELECT c.summary_short FROM afl.player_rankings_cache c WHERE c.player_id = pp.player_id LIMIT 1),
      NULL
    ),
    COALESCE(
      (SELECT c.ai_recommendation FROM afl.player_rankings_cache c WHERE c.player_id = pp.player_id LIMIT 1),
      NULL
    ),
    COALESCE(
      (SELECT c.recommendation_color FROM afl.player_rankings_cache c WHERE c.player_id = pp.player_id LIMIT 1),
      NULL
    ),

    now()

  FROM afl.mv_player_projection pp
  WHERE pp.is_active = true

  ON CONFLICT (player_id) DO UPDATE SET
    player_name         = EXCLUDED.player_name,
    team                = EXCLUDED.team,
    position            = EXCLUDED.position,
    price               = EXCLUDED.price,
    projection_final    = EXCLUDED.projection_final,
    breakeven           = EXCLUDED.breakeven,
    games_played        = EXCLUDED.games_played,
    season_avg          = EXCLUDED.season_avg,
    last3_avg           = EXCLUDED.last3_avg,
    last5_avg           = EXCLUDED.last5_avg,
    signal              = EXCLUDED.signal,
    trend_signal        = EXCLUDED.trend_signal,
    value_score         = EXCLUDED.value_score,
    value_signal        = EXCLUDED.value_signal,
    edge_score          = EXCLUDED.edge_score,
    edge_tier           = EXCLUDED.edge_tier,
    is_bye              = EXCLUDED.is_bye,
    status              = EXCLUDED.status,
    manual_status       = EXCLUDED.manual_status,
    summary_short       = COALESCE(EXCLUDED.summary_short, afl.player_rankings_cache.summary_short),
    ai_recommendation   = COALESCE(EXCLUDED.ai_recommendation, afl.player_rankings_cache.ai_recommendation),
    recommendation_color = COALESCE(EXCLUDED.recommendation_color, afl.player_rankings_cache.recommendation_color),
    cached_at           = now();

END;
$func$;
