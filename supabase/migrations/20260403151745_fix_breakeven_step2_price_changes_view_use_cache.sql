/*
  # Fix Breakeven Step 2 — v_price_changes reads BE from cache

  Previously v_price_changes computed its own breakeven as:
    ROUND(price / 7200.0, 1)

  This caused Market Watch to show a different BE than Rankings/Player/Teams pages.

  Now: reads breakeven directly from afl.player_rankings_cache (canonical).

  Must DROP + recreate because we cannot change column types in-place.
  Dependents: v_market_watch_signals → v_mw_premium → v_mw_free
  These all SELECT * or use named columns, so they inherit the correct value.
*/

-- Need to drop dependents first (they will be recreated from existing definitions)
DROP VIEW IF EXISTS public.v_market_watch_signals CASCADE;
DROP VIEW IF EXISTS afl.v_price_changes CASCADE;

-- Recreate v_price_changes with cache-sourced breakeven
CREATE VIEW afl.v_price_changes
WITH (security_invoker = false)
AS
WITH ordered_prices AS (
  SELECT
    pph.player_id,
    pph.price,
    pph.position,
    pph.round_number,
    pph.season,
    LAG(pph.price) OVER (
      PARTITION BY pph.player_id, pph.season
      ORDER BY pph.round_number
    ) AS prev_price,
    LAG(pph.round_number) OVER (
      PARTITION BY pph.player_id, pph.season
      ORDER BY pph.round_number
    ) AS prev_round,
    ROW_NUMBER() OVER (
      PARTITION BY pph.player_id, pph.season
      ORDER BY pph.round_number DESC
    ) AS rn
  FROM afl.player_price_history pph
  WHERE pph.season = 2026
),
latest AS (
  SELECT * FROM ordered_prices WHERE rn = 1
)
SELECT
  l.player_id,
  l.price                                                    AS current_price,
  l.prev_price                                               AS previous_price,
  l.round_number                                             AS current_round,
  l.prev_round                                               AS previous_round,
  (l.price - COALESCE(l.prev_price, l.price))               AS price_change,
  CASE
    WHEN COALESCE(l.prev_price, 0) > 0
    THEN ROUND((l.price - l.prev_price)::numeric / l.prev_price::numeric * 100.0, 2)
    ELSE 0::numeric
  END                                                        AS price_change_pct,
  l.position,
  COALESCE(r.projection_final, 0)::numeric                  AS projection,
  COALESCE(r.value_score, 0)::numeric                       AS value_score,
  COALESCE(r.neeko_rating, 0)::numeric                      AS neeko_rating,
  COALESCE(r.player_name, 'Unknown')                        AS player_name,
  r.team,
  r.ai_recommendation,
  r.recommendation_short,
  -- CANONICAL: read breakeven from cache, cast to plain numeric
  COALESCE(r.breakeven, 0)::numeric                         AS breakeven,
  -- price_edge: projection minus breakeven (both from cache)
  ROUND(
    COALESCE(r.projection_final, 0)::numeric
    - COALESCE(r.breakeven, 0)::numeric
  , 1)                                                       AS price_edge
FROM latest l
LEFT JOIN afl.player_rankings_cache r ON r.player_id = l.player_id
WHERE COALESCE(l.price, 0) > 0;

GRANT SELECT ON afl.v_price_changes TO authenticated, anon;


-- Recreate v_market_watch_signals (was dropped by CASCADE)
CREATE VIEW public.v_market_watch_signals
WITH (security_invoker = false)
AS
WITH thresholds AS (
  SELECT
    percentile_cont(0.25) WITHIN GROUP (ORDER BY value_score)::numeric AS vs_p25,
    percentile_cont(0.60) WITHIN GROUP (ORDER BY value_score)::numeric AS vs_p60,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value_score)::numeric AS vs_p75,
    percentile_cont(0.60) WITHIN GROUP (ORDER BY projection_final::double precision)::numeric AS proj_p60,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY projection_final::double precision)::numeric AS proj_p75
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL
    AND projection_final IS NOT NULL
    AND projection_final > 0
),
raw AS (
  SELECT
    pc.player_id,
    pc.player_name,
    pc.team,
    pc.position,
    pc.current_price,
    pc.previous_price,
    pc.price_change,
    pc.price_change_pct,
    pc.current_round,
    pc.previous_round,
    pc.projection,
    pc.value_score,
    pc.neeko_rating,
    pc.price_edge,
    pc.breakeven,
    pc.ai_recommendation,
    pc.recommendation_short,
    t.vs_p25,
    t.vs_p60,
    CASE
      WHEN pc.current_price < 450000 AND pc.price_change >= 10000
           AND pc.price_edge >= 3 AND pc.projection >= 38
        THEN 'CASH_COW'
      WHEN pc.current_price >= 300000 AND pc.current_price <= 750000
           AND pc.price_change >= -5000 AND pc.price_edge >= 5
           AND pc.value_score >= t.vs_p60
        THEN 'BUY_BEFORE_RISE'
      WHEN pc.price_edge <= -15 AND pc.value_score <= t.vs_p25
           AND pc.price_change <= 0
        THEN 'SELL_BEFORE_DROP'
      WHEN pc.price_change <= -50000 AND pc.price_edge <= -10
        THEN 'SELL_BEFORE_DROP'
      WHEN pc.current_price >= 700000 AND pc.price_edge <= -8
           AND pc.value_score <= t.vs_p25
        THEN 'FADE_TRAP'
      WHEN pc.price_change >= 10000
        THEN 'PRICE_RISE'
      WHEN pc.price_change <= -10000
        THEN 'PRICE_DROP'
      ELSE NULL
    END AS raw_signal
  FROM afl.v_price_changes pc
  CROSS JOIN thresholds t
  WHERE pc.current_price > 0 AND pc.projection > 0
),
ranked AS (
  SELECT
    *,
    PERCENT_RANK() OVER (
      PARTITION BY raw_signal
      ORDER BY (
        CASE raw_signal
          WHEN 'CASH_COW'        THEN price_change::numeric + price_edge * 5000
          WHEN 'BUY_BEFORE_RISE' THEN value_score * 10000 + price_edge * 3000
          WHEN 'SELL_BEFORE_DROP' THEN -(price_edge * 3000 + value_score * 10000)
          WHEN 'FADE_TRAP'       THEN -(value_score * 10000 + price_edge * 3000)
          WHEN 'PRICE_RISE'      THEN price_change::numeric
          WHEN 'PRICE_DROP'      THEN -price_change::numeric
          ELSE 0
        END
      ) DESC
    ) AS signal_rank_pct
  FROM raw
  WHERE raw_signal IS NOT NULL
)
SELECT
  player_id,
  player_name,
  team,
  position AS player_position,
  current_price AS price,
  previous_price,
  price_change,
  price_change_pct,
  current_round,
  previous_round,
  projection,
  value_score,
  neeko_rating,
  price_edge,
  breakeven,
  ai_recommendation,
  recommendation_short,
  raw_signal AS signal_type,
  ROUND(signal_rank_pct::numeric * 100, 1) AS signal_rank_pct
FROM ranked
WHERE
  CASE raw_signal
    WHEN 'CASH_COW'        THEN signal_rank_pct <= 0.15
    WHEN 'BUY_BEFORE_RISE' THEN signal_rank_pct <= 0.12
    WHEN 'SELL_BEFORE_DROP' THEN signal_rank_pct <= 0.12
    WHEN 'FADE_TRAP'       THEN signal_rank_pct <= 0.10
    WHEN 'PRICE_RISE'      THEN signal_rank_pct <= 0.10
    WHEN 'PRICE_DROP'      THEN signal_rank_pct <= 0.10
    ELSE false
  END
ORDER BY raw_signal, ROUND(signal_rank_pct::numeric * 100, 1);

GRANT SELECT ON public.v_market_watch_signals TO authenticated, anon;
