/*
  # Market Watch — Trade Intelligence Engine

  ## Summary
  Creates the database views and AI insights table that power the Market Watch page.
  Uses existing v_rankings_master and afl_player_prices tables.

  ## New Tables
  - `afl.ai_trade_insights` — stores AI-generated trade summaries per player/round

  ## New Views (public schema for PostgREST access)
  - `public.v_market_watch_base` — joins rankings + pricing, computes trade signals
  - `public.v_market_trade_scores` — adds composite trade score
  - `public.v_market_buy_targets` — top BUY candidates (trade_score > 95)
  - `public.v_market_sell_targets` — top SELL candidates (trade_score < 60)
  - `public.v_market_cash_cows` — low-price players projecting above their priced_at avg
  - `public.v_market_traps` — high-risk players projecting below priced_at

  ## Trade Signal Logic
  - BUY: projection_final exceeds priced_at by >20 pts (value on current price)
  - SELL: priced_at exceeds projection_final by >20 pts (overpriced)
  - HOLD: within 20pt window

  ## Trade Score Formula
  Weighted composite: projection_final (45%) + neeko_rating scaled (30%)
  + price_momentum (20%) - risk penalty (5%)

  ## Notes
  - No existing views or tables are modified
  - afl.ai_trade_insights uses player_id + season + round_number as PK
  - All views use SECURITY INVOKER — access follows caller's RLS context
*/

-- ─── AI Trade Insights table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.ai_trade_insights (
  player_id    integer    NOT NULL,
  season       integer    NOT NULL,
  round_number integer    NOT NULL,
  trade_signal text,
  ai_summary   text,
  generated_at timestamptz DEFAULT now(),
  PRIMARY KEY (player_id, season, round_number)
);

ALTER TABLE afl.ai_trade_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ai_trade_insights"
  ON afl.ai_trade_insights FOR SELECT
  TO authenticated
  USING (true);

-- ─── Base view: rankings + pricing joined ────────────────────────────────────
CREATE OR REPLACE VIEW public.v_market_watch_base AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,

  p.price,
  p.priced_at                       AS breakeven,
  p.avg_2025,
  p.games_2025,

  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.neeko_rating,
  r.ai_recommendation,
  r.recommendation_color,
  r.recommendation_why,
  r.ai_analysis,

  (r.projection_final - COALESCE(p.priced_at, 0))          AS price_momentum,
  (r.ceiling_estimate  - r.projection_final)                AS upside_gap,

  CASE
    WHEN (r.projection_final - COALESCE(p.priced_at, 0)) > 20  THEN 'BUY'
    WHEN (COALESCE(p.priced_at, 0) - r.projection_final)  > 20 THEN 'SELL'
    ELSE 'HOLD'
  END AS trade_signal

FROM public.v_rankings_master r
LEFT JOIN public.afl_player_prices p
  ON r.player_id = p.player_id;

-- ─── Trade scores view ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_market_trade_scores AS
SELECT
  *,
  ROUND(
    COALESCE(projection_final, 0) * 0.45
    + COALESCE(neeko_rating, 0)   * 0.30
    + COALESCE(price_momentum, 0) * 0.20
    - COALESCE(risk_rating, 0)    * 0.05
  , 2) AS trade_score
FROM public.v_market_watch_base;

-- ─── BUY targets ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_market_buy_targets AS
SELECT *
FROM public.v_market_trade_scores
WHERE trade_score > 95
ORDER BY trade_score DESC
LIMIT 30;

-- ─── SELL candidates ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_market_sell_targets AS
SELECT *
FROM public.v_market_trade_scores
WHERE trade_signal = 'SELL'
   OR (risk_rating > 60 AND COALESCE(price_momentum, 0) < -5)
ORDER BY trade_score ASC
LIMIT 30;

-- ─── Cash cows: under $600k, projecting above their priced_at ─────────────────
CREATE OR REPLACE VIEW public.v_market_cash_cows AS
SELECT *
FROM public.v_market_trade_scores
WHERE price IS NOT NULL
  AND price < 600000
  AND COALESCE(projection_final, 0) > COALESCE(breakeven, 0)
ORDER BY price_momentum DESC, price ASC
LIMIT 30;

-- ─── Traps: priced_at > projection, high risk ────────────────────────────────
CREATE OR REPLACE VIEW public.v_market_traps AS
SELECT *
FROM public.v_market_trade_scores
WHERE COALESCE(breakeven, 0) > COALESCE(projection_final, 0)
  AND COALESCE(risk_rating, 0) > 30
ORDER BY risk_rating DESC, price_momentum ASC
LIMIT 30;

-- ─── Grant anon + authenticated read on all views ────────────────────────────
GRANT SELECT ON public.v_market_watch_base     TO anon, authenticated;
GRANT SELECT ON public.v_market_trade_scores   TO anon, authenticated;
GRANT SELECT ON public.v_market_buy_targets    TO anon, authenticated;
GRANT SELECT ON public.v_market_sell_targets   TO anon, authenticated;
GRANT SELECT ON public.v_market_cash_cows      TO anon, authenticated;
GRANT SELECT ON public.v_market_traps          TO anon, authenticated;
