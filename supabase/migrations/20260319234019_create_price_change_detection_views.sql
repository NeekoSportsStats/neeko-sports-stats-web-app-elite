/*
  # Price Change Detection Views & Signal Classification

  ## What This Creates

  ### 1. afl.v_price_changes
  Current vs previous price per player with change metrics and projection data.

  ### 2. public.v_market_watch_signals
  Signal classification with distribution caps:
  - CASH_COW, BUY_BEFORE_RISE, SELL_BEFORE_DROP, FADE_TRAP, PRICE_RISE, PRICE_DROP
  Each capped at top 10-15% of qualifying players (prevents 182-sell / 0-buy imbalance).

  ### 3. public.v_price_change_debug
  Admin diagnostic view: distribution counts, avg changes, movers summary.

  ### 4. public.get_price_change_movers(limit)
  RPC returning top N risers and top N fallers.
*/

-- ── 1. afl.v_price_changes ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW afl.v_price_changes AS
WITH ordered_prices AS (
  SELECT
    player_id,
    price,
    "position",
    round_number,
    season,
    LAG(price) OVER (
      PARTITION BY player_id, season
      ORDER BY round_number ASC
    ) AS prev_price,
    LAG(round_number) OVER (
      PARTITION BY player_id, season
      ORDER BY round_number ASC
    ) AS prev_round,
    ROW_NUMBER() OVER (
      PARTITION BY player_id, season
      ORDER BY round_number DESC
    ) AS rn
  FROM afl.player_price_history
  WHERE season = 2026
)
SELECT
  op.player_id,
  op.price                                               AS current_price,
  op.prev_price                                          AS previous_price,
  op.round_number                                        AS current_round,
  op.prev_round                                          AS previous_round,
  (op.price - COALESCE(op.prev_price, op.price))         AS price_change,
  CASE
    WHEN COALESCE(op.prev_price, 0) > 0
    THEN ROUND(
      ((op.price - op.prev_price)::numeric / op.prev_price::numeric) * 100,
      2
    )
    ELSE 0::numeric
  END                                                    AS price_change_pct,
  op."position",
  COALESCE(r.projection_final, r.projection, 0)::numeric AS projection,
  COALESCE(r.value_score, 0)::numeric                    AS value_score,
  COALESCE(r.neeko_rating, 0)::numeric                   AS neeko_rating,
  COALESCE(r.player_name, 'Unknown')                     AS player_name,
  r.team,
  r.ai_recommendation,
  r.recommendation_short,
  ROUND(op.price::numeric / 7200.0, 1)                   AS breakeven,
  ROUND(
    (COALESCE(r.projection_final, r.projection, 0)::numeric)
    - (op.price::numeric / 7200.0),
    1
  )                                                      AS price_edge
FROM ordered_prices op
LEFT JOIN afl.player_rankings_cache r ON r.player_id = op.player_id
WHERE op.rn = 1
  AND COALESCE(op.price, 0) > 0;

GRANT SELECT ON afl.v_price_changes TO authenticated;

-- ── 2. public.v_market_watch_signals ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_market_watch_signals AS
WITH thresholds AS (
  SELECT
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score)::numeric       AS vs_p25,
    PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY value_score)::numeric       AS vs_p60,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score)::numeric       AS vs_p75,
    PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final)::numeric  AS proj_p60,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final)::numeric  AS proj_p75
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
    pc."position",
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
      WHEN pc.current_price < 450000
        AND pc.price_change >= 10000
        AND pc.price_edge >= 3
        AND pc.projection >= 38
      THEN 'CASH_COW'

      WHEN pc.current_price BETWEEN 300000 AND 750000
        AND pc.price_change >= -5000
        AND pc.price_edge >= 5
        AND pc.value_score >= t.vs_p60
      THEN 'BUY_BEFORE_RISE'

      WHEN pc.price_edge <= -15
        AND pc.value_score <= t.vs_p25
        AND pc.price_change <= 0
      THEN 'SELL_BEFORE_DROP'

      WHEN pc.price_change <= -50000
        AND pc.price_edge <= -10
      THEN 'SELL_BEFORE_DROP'

      WHEN pc.current_price >= 700000
        AND pc.price_edge <= -8
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
  WHERE pc.current_price > 0
    AND pc.projection > 0
),
ranked AS (
  SELECT *,
    PERCENT_RANK() OVER (
      PARTITION BY raw_signal
      ORDER BY
        CASE raw_signal
          WHEN 'CASH_COW'         THEN price_change::numeric + (price_edge * 5000)
          WHEN 'BUY_BEFORE_RISE'  THEN value_score * 10000 + price_edge * 3000
          WHEN 'SELL_BEFORE_DROP' THEN -(price_edge * 3000 + value_score * 10000)
          WHEN 'FADE_TRAP'        THEN -(value_score * 10000 + price_edge * 3000)
          WHEN 'PRICE_RISE'       THEN price_change::numeric
          WHEN 'PRICE_DROP'       THEN -price_change::numeric
          ELSE 0::numeric
        END DESC
    ) AS signal_rank_pct
  FROM raw
  WHERE raw_signal IS NOT NULL
)
SELECT
  player_id,
  player_name,
  team,
  "position"                                AS player_position,
  current_price                             AS price,
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
  raw_signal                                AS signal_type,
  ROUND(signal_rank_pct::numeric * 100, 1) AS signal_rank_pct
FROM ranked
WHERE
  CASE raw_signal
    WHEN 'CASH_COW'         THEN signal_rank_pct <= 0.15
    WHEN 'BUY_BEFORE_RISE'  THEN signal_rank_pct <= 0.12
    WHEN 'SELL_BEFORE_DROP' THEN signal_rank_pct <= 0.12
    WHEN 'FADE_TRAP'        THEN signal_rank_pct <= 0.10
    WHEN 'PRICE_RISE'       THEN signal_rank_pct <= 0.10
    WHEN 'PRICE_DROP'       THEN signal_rank_pct <= 0.10
    ELSE false
  END
ORDER BY raw_signal, signal_rank_pct ASC;

GRANT SELECT ON public.v_market_watch_signals TO anon, authenticated;

-- ── 3. public.v_price_change_debug ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_price_change_debug AS
WITH signal_counts AS (
  SELECT
    signal_type,
    COUNT(*)                                    AS player_count,
    ROUND(AVG(price_change)::numeric)           AS avg_price_change,
    MAX(price_change)                           AS max_rise,
    MIN(price_change)                           AS max_drop,
    ROUND(AVG(value_score)::numeric, 2)         AS avg_value_score,
    ROUND(AVG(projection)::numeric, 1)          AS avg_projection
  FROM public.v_market_watch_signals
  GROUP BY signal_type
),
totals AS (
  SELECT
    COUNT(DISTINCT player_id)                   AS total_players_with_history,
    COUNT(DISTINCT player_id) FILTER (
      WHERE price_change > 0
    )                                           AS players_with_rise,
    COUNT(DISTINCT player_id) FILTER (
      WHERE price_change < 0
    )                                           AS players_with_drop,
    COUNT(DISTINCT player_id) FILTER (
      WHERE price_change = 0 OR price_change IS NULL
    )                                           AS players_no_change,
    ROUND(AVG(price_change)::numeric)           AS avg_price_change_all,
    MAX(price_change)                           AS largest_rise,
    MIN(price_change)                           AS largest_drop
  FROM afl.v_price_changes
  WHERE current_price > 0
)
SELECT
  t.total_players_with_history,
  t.players_with_rise,
  t.players_with_drop,
  t.players_no_change,
  t.avg_price_change_all,
  t.largest_rise,
  t.largest_drop,
  COALESCE(json_agg(
    json_build_object(
      'signal_type',     s.signal_type,
      'player_count',    s.player_count,
      'avg_change',      s.avg_price_change,
      'max_rise',        s.max_rise,
      'max_drop',        s.max_drop,
      'avg_value_score', s.avg_value_score,
      'avg_projection',  s.avg_projection
    ) ORDER BY s.player_count DESC
  ), '[]'::json)                               AS signal_distribution
FROM totals t
LEFT JOIN signal_counts s ON true
GROUP BY
  t.total_players_with_history,
  t.players_with_rise,
  t.players_with_drop,
  t.players_no_change,
  t.avg_price_change_all,
  t.largest_rise,
  t.largest_drop;

GRANT SELECT ON public.v_price_change_debug TO authenticated;

-- ── 4. Top movers RPC ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_price_change_movers(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  player_id         bigint,
  player_name       text,
  team              text,
  player_position   text,
  current_price     integer,
  previous_price    integer,
  price_change      integer,
  price_change_pct  numeric,
  projection        numeric,
  value_score       numeric,
  signal_type       text,
  direction         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
  (
    SELECT
      s.player_id, s.player_name, s.team, s.player_position,
      s.price        AS current_price,
      s.previous_price,
      s.price_change,
      s.price_change_pct,
      s.projection,
      s.value_score,
      s.signal_type,
      'rise'::text   AS direction
    FROM public.v_market_watch_signals s
    WHERE s.price_change > 0
    ORDER BY s.price_change DESC
    LIMIT p_limit
  )
  UNION ALL
  (
    SELECT
      s.player_id, s.player_name, s.team, s.player_position,
      s.price        AS current_price,
      s.previous_price,
      s.price_change,
      s.price_change_pct,
      s.projection,
      s.value_score,
      s.signal_type,
      'drop'::text   AS direction
    FROM public.v_market_watch_signals s
    WHERE s.price_change < 0
    ORDER BY s.price_change ASC
    LIMIT p_limit
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_price_change_movers(integer)
  TO authenticated;
