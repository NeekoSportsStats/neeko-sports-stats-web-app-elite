/*
  # Market Watch V3.1 — Fix buy_before_rise + Trade Engine Views

  ## Summary
  Two-part upgrade to the Market Watch system:

  ## Part 1 — Fix buy_before_rise
  The previous logic required `exp_price_change > 0` which was too strict early
  season (very few players have positive EPC when prices haven't moved much yet).

  New logic adds TWO types:
  - TYPE A (True Price Rise): EPC > 0 AND proj > breakeven
  - TYPE B (Early Buy / Pre-Rise): EPC > -15000 AND delta >= 10

  Priority order corrected:
  1. cash_cow       (< $350k, strong EPC >= $50k, cheap rookies)
  2. buy_before_rise (TYPE A: EPC > 0 + delta >= 5; TYPE B: EPC > -15k + delta >= 10)
  3. upgrade_target  (high scorers, good value)
  4. sell_before_drop (hard negative signal)
  5. fade_trap       (overpriced bad value)
  6. monitor

  ## Part 2 — Trade Engine Views
  - market.v_trade_recommendations — top 20 OUT→IN trade pairs
  - market.v_trade_best — top 1 trade pair (hero card)

  ## Security
  No RLS changes. Existing policies preserved.
  New views granted SELECT to anon + authenticated.
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1: REBUILD SNAPSHOT FUNCTION WITH FIXED buy_before_rise LOGIC
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'public', 'afl'
AS $function$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
  v_vs_p75       numeric;
  v_vs_p90       numeric;
  v_vs_p10       numeric;
  v_vs_p25       numeric;
  v_nr_p85       numeric;
  v_nr_p40       numeric;
  v_proj_p75     numeric;
  v_proj_p60     numeric;
  v_proj_p40     numeric;
BEGIN

  -- 1. Determine current season/round
  SELECT season, MAX(week)
  INTO   v_season, v_round
  FROM   afl.player_games
  GROUP  BY season
  ORDER  BY season DESC
  LIMIT  1;

  IF v_season IS NULL THEN
    v_season := 2026;
    v_round  := 1;
  END IF;

  -- 2. Compute live percentiles from rankings cache
  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score), 2.0),
    COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value_score), 4.0),
    COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value_score), 0.1),
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score), 0.5),
    COALESCE(PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY neeko_rating), 56.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY neeko_rating), 43.0)
  INTO v_vs_p75, v_vs_p90, v_vs_p10, v_vs_p25, v_nr_p85, v_nr_p40
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL AND neeko_rating IS NOT NULL;

  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final), 75.0),
    COALESCE(PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final), 65.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY projection_final), 54.0)
  INTO v_proj_p75, v_proj_p60, v_proj_p40
  FROM afl.player_rankings_cache
  WHERE projection_final IS NOT NULL AND projection_final > 0;

  -- 3. Deactivate / create snapshot
  UPDATE market.market_watch_snapshot
  SET    is_active = false
  WHERE  season = v_season AND round_number = v_round;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(),
        is_active  = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  -- 4. Build snapshot players
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, projection, breakeven, ceiling, risk_pct,
    price_edge_pts, expected_price_change, category, action, trade_score, reasons,
    projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score,
    price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status
  )
  WITH games_count AS (
    SELECT player_id, COUNT(*) AS games_played
    FROM   afl.player_games
    WHERE  season = v_season
    GROUP  BY player_id
  ),
  last3 AS (
    SELECT player_id,
           ROUND(AVG(fantasy_score)::numeric, 1) AS last3_avg
    FROM (
      SELECT player_id, fantasy_score,
             ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
      FROM   afl.player_games
      WHERE  season = v_season AND fantasy_score IS NOT NULL
    ) ranked
    WHERE rn <= 3
    GROUP BY player_id
  ),
  base AS (
    SELECT
      r.player_id, r.player_name, r.team, r.position,
      COALESCE(r.price, 0)::numeric                                        AS price,
      COALESCE(r.projection_final, r.projection, 0)::numeric               AS proj,
      ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)                     AS breakeven,
      COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
      COALESCE(r.floor, r.floor_estimate, 0)::numeric                      AS floor_val,
      COALESCE(r.risk_rating, 50)::numeric                                 AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                                  AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                                 AS neeko_r,
      COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric          AS neeko_scaled,
      COALESCE(r.consistency_tier, 'Variable')                             AS cons_tier,
      COALESCE(r.projection_confidence, 50)::numeric                       AS confidence,
      r.value_tag, r.matchup_rating AS matchup_lbl,
      r.ai_recommendation, r.market_watch_category AS rc_mw_cat,
      r.recommendation_short,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)                AS last3_avg_calc,
      COALESCE(gc.games_played, 0)                                         AS games_played
    FROM afl.player_rankings_cache r
    LEFT JOIN last3       l  ON l.player_id  = r.player_id
    LEFT JOIN games_count gc ON gc.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
      AND COALESCE(r.price, 0) > 0
      AND COALESCE(r.projection_final, r.projection, 0) > 0
      AND NOT (COALESCE(r.price, 0) <= 250000 AND COALESCE(gc.games_played, 0) = 0)
  ),
  valued AS (
    SELECT *,
      ROUND((proj - breakeven) * 7200.0) AS exp_price_change,
      ROUND(proj - breakeven, 1)          AS price_edge,
      ROUND(proj * 7200)                  AS est_price
    FROM base
  ),
  with_momentum AS (
    SELECT v.*,
      COALESCE(
        v.val_score - (
          SELECT h.value_score
          FROM   market.mw_value_history h
          WHERE  h.player_id = v.player_id AND h.season = v_season
          ORDER  BY h.round_number DESC LIMIT 1
        ),
        0
      )::numeric AS momentum_val
    FROM valued v
  ),
  with_projections AS (
    SELECT *,
      price + COALESCE(exp_price_change, 0)                        AS proj_r1,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8                 AS proj_r2,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8
            + COALESCE(exp_price_change, 0) * 0.6                 AS proj_r3
    FROM with_momentum
  ),
  with_peak AS (
    SELECT *,
      GREATEST(COALESCE(price,0), COALESCE(proj_r1,0), COALESCE(proj_r2,0), COALESCE(proj_r3,0)) AS peak_p,
      CASE
        WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r3,-1) THEN 'round_plus_3'
        WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r2,-1) THEN 'round_plus_2'
        WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r1,-1) THEN 'round_plus_1'
        ELSE 'now'
      END AS peak_r
    FROM with_projections
  ),
  categorised AS (
    SELECT *,
      CASE peak_r
        WHEN 'round_plus_3' THEN 'strong_hold'
        WHEN 'round_plus_2' THEN 'hold'
        WHEN 'round_plus_1' THEN 'sell_soon'
        ELSE 'sell'
      END AS peak_st,

      -- ════════════════════════════════════════════════════════════════════
      -- 5-CATEGORY CLASSIFICATION V3.1
      --
      -- Priority order:
      -- 1. SELL_BEFORE_DROP   hard negative signals — urgent exit
      -- 2. FADE_TRAP          overpriced bad value — avoid as trade-in
      -- 3. CASH_COW           ultra-cheap rookies (<$350k) generating fast cash
      -- 4. BUY_BEFORE_RISE    TYPE A: EPC > 0 (true price rise)
      --                       TYPE B: EPC > -15k + delta >= 10 (early buy pre-rise)
      --                       Both exclude ultra-cheap (already cash_cow) if EPC >= 50k
      -- 5. UPGRADE_TARGET     premium/mid scorers worth trading in for points
      -- 6. MONITOR            everything else
      -- ════════════════════════════════════════════════════════════════════
      CASE

        -- ── 1. SELL BEFORE DROP ──────────────────────────────────────────
        -- Urgent exit — strong negative price signals
        WHEN exp_price_change <= -200000
          AND (proj - breakeven) <= -20
        THEN 'sell_before_drop'

        WHEN (proj - breakeven) <= -25
          AND val_score <= v_vs_p25
        THEN 'sell_before_drop'

        WHEN exp_price_change <= -150000
          AND risk_pct >= 60
          AND (proj - breakeven) <= -15
        THEN 'sell_before_drop'

        -- ── 2. FADE TRAP ─────────────────────────────────────────────────
        -- Overpriced for actual output — bad trade-in at current price
        WHEN price >= 700000
          AND (proj - breakeven) BETWEEN -30 AND -5
          AND val_score <= v_vs_p10
        THEN 'fade_trap'

        WHEN price >= 900000
          AND val_score <= 0
          AND (proj - breakeven) <= -5
        THEN 'fade_trap'

        WHEN (proj - breakeven) <= -30
          AND price >= 600000
        THEN 'fade_trap'

        -- ── 3. CASH COW ──────────────────────────────────────────────────
        -- Ultra-cheap players (< $350k) generating cash fast.
        -- You're holding these for price rise. Strong positive EPC required.
        WHEN price < 350000
          AND exp_price_change >= 50000
          AND (proj - breakeven) >= 5
          AND proj >= 40
        THEN 'cash_cow'

        -- ── 4. BUY BEFORE RISE ───────────────────────────────────────────
        -- TYPE A — TRUE PRICE RISE
        -- EPC > 0 + beats breakeven: buying before a confirmed price increase.
        -- Price band: $300k–$750k (above cash cow base, below pure premium).
        WHEN price BETWEEN 300000 AND 750000
          AND exp_price_change > 0
          AND (proj - breakeven) >= 5
          AND proj >= 40
        THEN 'buy_before_rise'

        -- TYPE B — EARLY BUY (PRE-RISE)
        -- Near-flat or trivially negative EPC BUT projection significantly
        -- exceeds breakeven — price rise is imminent within 1-2 rounds.
        -- EPC > -15k means price is almost flat (not falling hard).
        -- delta >= 10 means scoring well above what sustains current price.
        WHEN price BETWEEN 300000 AND 750000
          AND exp_price_change > -15000
          AND (proj - breakeven) >= 10
          AND proj >= 45
          AND val_score >= 0
        THEN 'buy_before_rise'

        -- Also capture cheap players (< $350k) with moderate positive EPC
        -- that didn't qualify for cash_cow (EPC 20k-49k range)
        WHEN price < 350000
          AND exp_price_change BETWEEN 20000 AND 49999
          AND (proj - breakeven) >= 3
          AND proj >= 40
        THEN 'buy_before_rise'

        -- ── 5. UPGRADE TARGET ────────────────────────────────────────────
        -- Premium/mid-price scorers worth trading in for scoring output.
        -- Price may have flat/mildly negative EPC — that's OK.
        WHEN proj >= v_proj_p75
          AND val_score >= 5.0
          AND (proj - breakeven) >= -20
          AND price >= 400000
          AND exp_price_change > -250000
        THEN 'upgrade_target'

        WHEN proj >= v_proj_p60 + 10
          AND val_score >= v_vs_p75
          AND price >= 500000
          AND exp_price_change > -300000
        THEN 'upgrade_target'

        -- ── 6. MONITOR ───────────────────────────────────────────────────
        ELSE 'monitor'

      END AS cat,

      -- CATEGORY REASON
      CASE
        WHEN exp_price_change <= -200000 AND (proj - breakeven) <= -20 THEN
          'Price falling fast — down ~' || TO_CHAR(ABS(ROUND(exp_price_change)), 'FM$999,999') || ' this round'
        WHEN (proj - breakeven) <= -25 THEN
          'Scoring ' || ROUND(ABS(proj - breakeven), 0)::text || ' pts below breakeven — price dropping'
        WHEN price >= 700000 AND val_score <= v_vs_p10 AND (proj - breakeven) BETWEEN -30 AND -5 THEN
          'Overpriced trap — poor value at $' || TO_CHAR(ROUND(price), 'FM999,999')
        WHEN price < 350000 AND exp_price_change >= 50000 THEN
          'Cash generator — price up ~' || TO_CHAR(ABS(ROUND(exp_price_change)), 'FM$999,999') || ' this round'
        WHEN exp_price_change > 0 AND (proj - breakeven) >= 5 THEN
          'Price rising — beats breakeven by ' || ROUND(proj - breakeven, 0)::text || ' pts'
        WHEN exp_price_change > -15000 AND (proj - breakeven) >= 10 THEN
          'Pre-rise buy — projecting ' || ROUND(proj, 0)::text || ' vs BE ' || ROUND(breakeven, 0)::text || ', price move imminent'
        WHEN proj >= v_proj_p75 AND val_score >= 5.0 THEN
          'Scoring upgrade — projects ' || ROUND(proj, 0)::text || ' pts, strong value'
        ELSE
          'Within tracking range — no urgent action'
      END AS cat_reason,

      CASE
        WHEN momentum_val > 3.0  THEN 'rising'
        WHEN momentum_val > 1.5  THEN 'improving'
        WHEN momentum_val > 0.5  THEN 'stable'
        WHEN momentum_val < -3.0 THEN 'falling'
        WHEN momentum_val < -1.0 THEN 'cooling'
        ELSE                          'stable'
      END AS mom_label,

      CASE
        WHEN proj >= last3_avg_calc * 1.15
          AND COALESCE(ceiling_val, 0) >= 110
          AND (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) >= 15
          AND risk_pct <= 55 THEN true
        ELSE false
      END AS breakout_flag_calc,

      LEAST(100, GREATEST(0,
        ROUND(
          neeko_scaled * 0.5
          + CASE WHEN (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) > 0
              THEN LEAST(30, (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) * 1.5)
              ELSE 0 END
          + CASE WHEN val_score >= v_vs_p90 THEN 20 ELSE 0 END
          + CASE WHEN momentum_val > 1.5    THEN 10 ELSE 0 END
          - risk_pct * 0.3
        )
      )) AS breakout_score_calc,

      LEAST(100,
        COALESCE(ceiling_val - floor_val, 0) * (COALESCE(risk_pct, 0) / 100.0)
      ) AS vol_score

    FROM with_peak
  ),
  ranked AS (
    SELECT *,
      ROUND(
        PERCENT_RANK() OVER (
          ORDER BY (
            COALESCE(proj - breakeven, 0) * 3.0
            + neeko_scaled * 0.40
            + COALESCE(val_score, 0) * 5 * 0.25
            + confidence * 0.10
            + CASE WHEN cat IN ('buy_before_rise','cash_cow','upgrade_target') THEN 20 ELSE 0 END
            + CASE WHEN momentum_val > 1.5 THEN 5 ELSE 0 END
            - COALESCE(risk_pct, 50) * 0.15
          )
        ) * 100
      )::numeric AS trade_score_pct
    FROM categorised
  )
  SELECT
    v_snapshot_id,
    player_id, player_name, team, position,
    price,
    proj                AS projection,
    breakeven,
    ceiling_val         AS ceiling,
    risk_pct,
    price_edge          AS price_edge_pts,
    exp_price_change    AS expected_price_change,
    cat                 AS category,
    CASE
      WHEN cat = 'buy_before_rise'  THEN 'BUY'
      WHEN cat = 'cash_cow'         THEN 'BUY'
      WHEN cat = 'upgrade_target'   THEN 'BUY'
      WHEN cat = 'sell_before_drop' THEN 'SELL'
      WHEN cat = 'fade_trap'        THEN 'AVOID'
      ELSE 'HOLD'
    END AS action,
    ROUND(trade_score_pct, 1) AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_r,
      'consistency_tier', cons_tier,
      'matchup_label',    matchup_lbl,
      'category_reason',  cat_reason,
      'confidence',       confidence
    ) AS reasons,
    price + COALESCE(exp_price_change, 0)  AS projected_price,
    proj_r1             AS projected_price_r1,
    proj_r2             AS projected_price_r2,
    proj_r3             AS projected_price_r3,
    ROUND(breakout_score_calc) AS breakout_score,
    breakout_flag_calc  AS breakout_flag,
    vol_score           AS volatility_score,
    CASE WHEN vol_score >= 60 THEN 'HIGH' WHEN vol_score >= 30 THEN 'MEDIUM' ELSE 'LOW' END AS volatility_level,
    last3_avg_calc      AS last3_avg,
    est_price           AS estimated_price,
    val_score           AS value_score,
    ROUND(est_price * 1.10) AS price_range_top,
    ROUND(est_price * 0.90) AS price_range_bottom,
    momentum_val        AS value_momentum,
    mom_label           AS momentum_label,
    peak_p              AS peak_price,
    peak_r              AS peak_round,
    peak_st             AS peak_status
  FROM ranked;

  -- 5. Update value history
  INSERT INTO market.mw_value_history (player_id, round_number, season, value_score, estimated_price, price)
  SELECT player_id, v_round, v_season, value_score, estimated_price, price
  FROM   market.market_watch_snapshot_players
  WHERE  snapshot_id = v_snapshot_id AND value_score IS NOT NULL
  ON CONFLICT (player_id, round_number, season) DO UPDATE
    SET value_score     = EXCLUDED.value_score,
        estimated_price = EXCLUDED.estimated_price,
        price           = EXCLUDED.price,
        created_at      = now();

END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 2: TRADE ENGINE VIEWS
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS market.v_trade_best CASCADE;
DROP VIEW IF EXISTS market.v_trade_recommendations CASCADE;

CREATE VIEW market.v_trade_recommendations AS
WITH active_snap AS (
  SELECT snapshot_id
  FROM   market.market_watch_snapshot
  WHERE  is_active = true
  LIMIT  1
),
sell_candidates AS (
  SELECT
    p.player_id        AS sell_player_id,
    p.player_name      AS sell_player_name,
    p.team             AS sell_team,
    p.position         AS sell_position,
    p.price            AS sell_price,
    p.projection       AS sell_projection,
    p.breakeven        AS sell_breakeven,
    p.expected_price_change AS sell_epc,
    p.value_score      AS sell_value_score,
    p.category         AS sell_category,
    (p.projection - p.breakeven) AS sell_delta,
    ROW_NUMBER() OVER (
      ORDER BY p.expected_price_change ASC, p.value_score ASC
    ) AS sell_rank
  FROM market.market_watch_snapshot_players p
  JOIN active_snap s ON s.snapshot_id = p.snapshot_id
  WHERE p.category IN ('sell_before_drop', 'fade_trap')
  LIMIT 25
),
buy_candidates AS (
  SELECT
    p.player_id        AS buy_player_id,
    p.player_name      AS buy_player_name,
    p.team             AS buy_team,
    p.position         AS buy_position,
    p.price            AS buy_price,
    p.projection       AS buy_projection,
    p.breakeven        AS buy_breakeven,
    p.expected_price_change AS buy_epc,
    p.value_score      AS buy_value_score,
    p.trade_score      AS buy_trade_score,
    p.category         AS buy_category,
    (p.projection - p.breakeven) AS buy_delta,
    ROW_NUMBER() OVER (
      ORDER BY p.projection DESC, p.value_score DESC
    ) AS buy_rank
  FROM market.market_watch_snapshot_players p
  JOIN active_snap s ON s.snapshot_id = p.snapshot_id
  WHERE p.category IN ('upgrade_target', 'buy_before_rise')
  LIMIT 25
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
    b.buy_player_id,
    b.buy_player_name,
    b.buy_team,
    b.buy_position,
    b.buy_price,
    b.buy_projection,
    b.buy_category,
    (s.sell_price - b.buy_price)       AS cash_delta,
    (b.buy_projection - s.sell_projection) AS projection_gain,
    ROUND(
      (b.buy_projection - s.sell_projection) * 2.0
      + (s.sell_price - b.buy_price) / 1000.0
      + COALESCE(b.buy_value_score, 0) * 5.0
    )                                  AS trade_score
  FROM sell_candidates s
  CROSS JOIN buy_candidates b
  WHERE b.buy_player_id <> s.sell_player_id
    AND (b.buy_projection - s.sell_projection) > 5
    AND b.buy_projection > s.sell_projection
    AND (s.sell_price - b.buy_price) >= -100000
)
SELECT *
FROM   trade_pairs
ORDER  BY trade_score DESC
LIMIT  20;

GRANT SELECT ON market.v_trade_recommendations TO anon, authenticated;


CREATE VIEW market.v_trade_best AS
SELECT *
FROM   market.v_trade_recommendations
LIMIT  1;

GRANT SELECT ON market.v_trade_best TO anon, authenticated;


-- Public wrappers so frontend can query without schema prefix
DROP VIEW IF EXISTS public.v_trade_recommendations CASCADE;
DROP VIEW IF EXISTS public.v_trade_best CASCADE;

CREATE VIEW public.v_trade_recommendations AS
SELECT * FROM market.v_trade_recommendations;

CREATE VIEW public.v_trade_best AS
SELECT * FROM market.v_trade_best;

GRANT SELECT ON public.v_trade_recommendations TO anon, authenticated;
GRANT SELECT ON public.v_trade_best TO anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- Run the snapshot immediately to repopulate with fixed logic
-- ══════════════════════════════════════════════════════════════════════════════
SELECT market.build_market_watch_snapshot();
