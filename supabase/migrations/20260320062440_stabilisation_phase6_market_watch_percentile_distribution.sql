
/*
  # Phase 6: Market Watch Percentile Distribution Fix

  ## Problem
  The current market_watch_category on afl.player_rankings_cache shows 88% SELL.
  This is because the old logic used hard thresholds on value_score which fail
  when most players score below breakeven (negative value_score).

  ## Solution
  Replace threshold logic with percent_rank() distribution:
  - Top 10%  → Buy
  - Next 15% → Upgrade
  - Middle 50% → Hold
  - Bottom 15% → Sell
  - Bottom 10% → Trap

  ## New function: afl.fn_apply_market_watch_categories()
  Runs inside the pipeline after rankings cache is refreshed. Updates
  market_watch_category on afl.player_rankings_cache using percentile bands.

  ## Validation check
  Returns false if Sell+Trap > 40% OR Buy < 5% (distribution is broken).

  ## Tables modified
  - afl.player_rankings_cache (market_watch_category column)
*/

CREATE OR REPLACE FUNCTION afl.fn_apply_market_watch_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public', 'admin'
AS $$
DECLARE
  v_buy_count     integer;
  v_upgrade_count integer;
  v_hold_count    integer;
  v_sell_count    integer;
  v_trap_count    integer;
  v_total         integer;
  v_buy_pct       numeric;
  v_sell_pct      numeric;
  v_dist_ok       boolean;
BEGIN
  /*
    Use a composite trade signal:
      - value_score (pts per $100k)     weight 0.45
      - neeko_rating (normalised 0-100) weight 0.35
      - form_score (recent form)        weight 0.20

    All three are normalised via percent_rank() to avoid scale issues.
    Then assign percentile buckets:
      top 10%       → Buy
      10% – 25%     → Upgrade
      25% – 75%     → Hold
      75% – 90%     → Sell
      bottom 10%    → Trap
  */

  WITH scored AS (
    SELECT
      player_id,
      -- composite trade signal using percent_rank on each component
      (
        0.45 * PERCENT_RANK() OVER (ORDER BY COALESCE(value_score, -999))
      + 0.35 * PERCENT_RANK() OVER (ORDER BY COALESCE(neeko_rating, 0))
      + 0.20 * PERCENT_RANK() OVER (ORDER BY COALESCE(form_score, 0))
      ) AS composite_rank
    FROM afl.player_rankings_cache
    WHERE player_id IS NOT NULL
  ),
  with_pct AS (
    SELECT
      player_id,
      composite_rank,
      PERCENT_RANK() OVER (ORDER BY composite_rank) AS final_pct
    FROM scored
  ),
  categorised AS (
    SELECT
      player_id,
      CASE
        WHEN final_pct >= 0.90 THEN 'Buy'
        WHEN final_pct >= 0.75 THEN 'Upgrade'
        WHEN final_pct >= 0.25 THEN 'Hold'
        WHEN final_pct >= 0.10 THEN 'Sell'
        ELSE 'Trap'
      END AS new_category
    FROM with_pct
  )
  UPDATE afl.player_rankings_cache r
  SET market_watch_category = c.new_category
  FROM categorised c
  WHERE r.player_id = c.player_id;

  -- Capture distribution counts
  SELECT
    COUNT(*) FILTER (WHERE market_watch_category = 'Buy'),
    COUNT(*) FILTER (WHERE market_watch_category = 'Upgrade'),
    COUNT(*) FILTER (WHERE market_watch_category = 'Hold'),
    COUNT(*) FILTER (WHERE market_watch_category = 'Sell'),
    COUNT(*) FILTER (WHERE market_watch_category = 'Trap'),
    COUNT(*)
  INTO v_buy_count, v_upgrade_count, v_hold_count, v_sell_count, v_trap_count, v_total
  FROM afl.player_rankings_cache;

  IF v_total > 0 THEN
    v_buy_pct  := ROUND(v_buy_count::numeric  / v_total * 100, 1);
    v_sell_pct := ROUND((v_sell_count + v_trap_count)::numeric / v_total * 100, 1);
  ELSE
    v_buy_pct  := 0;
    v_sell_pct := 0;
  END IF;

  -- Validation: Sell+Trap <= 35% and Buy >= 5%
  v_dist_ok := (v_sell_pct <= 35.0 AND v_buy_pct >= 5.0);

  RETURN jsonb_build_object(
    'ok',           v_dist_ok,
    'total',        v_total,
    'buy',          v_buy_count,
    'upgrade',      v_upgrade_count,
    'hold',         v_hold_count,
    'sell',         v_sell_count,
    'trap',         v_trap_count,
    'buy_pct',      v_buy_pct,
    'sell_trap_pct', v_sell_pct
  );
END;
$$;

-- Run immediately to fix existing data
SELECT afl.fn_apply_market_watch_categories();
