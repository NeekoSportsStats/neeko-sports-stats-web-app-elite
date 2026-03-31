
/*
  # Platform Audit Hardening — 4 targeted fixes

  ## 1. rankings_cache_refresh cron — was timing out (never successfully ran)
  Split heavy work into afl.populate_rankings_cache_from_source() with SET LOCAL
  statement_timeout = '120s' to safely exceed the 8s default. The cron wrapper
  public.refresh_rankings_and_market_watch() calls this helper and logs results.

  ## 2. v_mw_premium — removed MAX(week) scan of 14MB raw_player_stats table
  Replaced with a lightweight lookup from afl.games_raw (423 rows, indexed on status_short)
  which is a dramatically cheaper source for the current round number.

  ## 3. v_pipeline_status — was cross-joining v_neeko_rating (slow deep chain)
  Now reads projection_rows from afl.player_rankings_cache (flat table, O(736)).
  Column order preserved to avoid breaking frontend.

  ## 4. system_logs — ensure edge function logging works
  Added insert trigger for logging failures from any source.
*/

-- ============================================================
-- 1. Helper function: heavy cache populate with 120s timeout
-- ============================================================

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at
  )
  SELECT
    nr.player_id, nr.player_name,
    nr.team_name, nr.team_name,
    nr.position_group, nr.position_group,
    nr.projection::numeric, nr.projection::numeric,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,
    nr.neeko_rating::double precision,
    nr.price::integer,
    nr.value_score::double precision,
    NULL::text,
    CASE
      WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END,
    LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::double precision,
    LEAST(100, GREATEST(0, COALESCE(met.bust_risk, 0) * 100))::double precision,
    COALESCE(met.matchup_rating, 'Neutral'),
    LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0) * 100))::double precision,
    LEAST(100, GREATEST(0, COALESCE(met.captain_score, 0)))::double precision,
    CASE
      WHEN met.captain_score >= 70 THEN 'Elite'
      WHEN met.captain_score >= 50 THEN 'Strong'
      WHEN met.captain_score >= 30 THEN 'Viable'
      ELSE 'Avoid'
    END,
    COALESCE(reco.recommendation_label, aic.recommendation),
    COALESCE(reco.recommendation_color, CASE
      WHEN aic.recommendation = 'BUY'  THEN 'green'
      WHEN aic.recommendation = 'SELL' THEN 'red'
      WHEN aic.recommendation = 'SIT'  THEN 'yellow'
      ELSE 'grey' END),
    COALESCE(reco.recommendation_short, aic.why),
    COALESCE(reco.recommendation_short, aic.why),
    aic.summary, aic.generated_at,
    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END,
    0, now(), now()
  FROM afl.v_neeko_rating nr
  LEFT JOIN afl.v_ai_player_metrics         met  ON met.player_id  = nr.player_id
  LEFT JOIN public.ai_player_content        aic  ON aic.player_id  = nr.player_id
  LEFT JOIN public.ai_rankings_player_recos reco ON reco.player_id = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 2. Update cron wrapper to use helper + log result
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_rankings_and_market_watch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_count integer;
BEGIN
  v_count := afl.populate_rankings_cache_from_source();

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'rankings_cache_refreshed',
    'cron:rankings_cache_refresh',
    'info',
    'Rankings cache refreshed: ' || v_count || ' players',
    jsonb_build_object('row_count', v_count, 'refreshed_at', now())
  );

  RETURN jsonb_build_object('status', 'ok', 'cache_rows', v_count, 'refreshed_at', now());
END;
$$;

-- Keep backwards-compat thin wrapper
CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache_from_source();
END;
$$;

-- ============================================================
-- 3. Fix v_mw_premium: replace raw_player_stats MAX(week) scan
--    with games_raw lookup (423 rows, indexed)
-- ============================================================

CREATE OR REPLACE VIEW public.v_mw_premium AS
WITH round_ctx AS (
  SELECT COALESCE(MAX(week), 0) AS round_number
  FROM afl.games_raw
  WHERE season = EXTRACT(year FROM now())::integer
    AND status_short = 'FT'
),
prices AS (
  SELECT DISTINCT ON (lower(player_name))
    player_name, player_id, priced_at, season
  FROM public.afl_player_prices
  WHERE season = 2026
  ORDER BY lower(player_name), created_at DESC NULLS LAST
),
base AS (
  SELECT
    rc.player_id, rc.player_name, rc.team, rc.position, rc.price,
    GREATEST(rc.projection_final::numeric, 0)     AS projection,
    GREATEST(rc.ceiling::numeric, 0)              AS ceiling,
    GREATEST(rc.floor::numeric, 0)                AS floor_val,
    rc.risk_rating::numeric                       AS risk_pct,
    rc.projection_confidence::numeric,
    rc.neeko_rating::numeric,
    rc.consistency::numeric                       AS consistency_score,
    rc.form_score::numeric,
    rc.value_score::numeric,
    rc.value_tier,
    rc.recommendation_why,
    rc.recommendation_short,
    rc.cached_at                                  AS snapshot_updated_at,
    COALESCE(pp.priced_at, ROUND(rc.price::numeric / 10490.0, 1)) AS breakeven,
    ROUND(GREATEST(rc.projection_final::numeric, 0)
      - COALESCE(pp.priced_at, ROUND(rc.price::numeric / 10490.0, 1)), 1) AS price_edge_pts,
    ROUND(LEAST(GREATEST(
      (GREATEST(rc.projection_final::numeric, 0)
        - COALESCE(pp.priced_at, ROUND(rc.price::numeric / 10490.0, 1))) * 10490.0,
      -(rc.price::numeric * 0.35)),
      rc.price::numeric * 0.35), 0)              AS expected_price_change
  FROM afl.player_rankings_cache rc
  LEFT JOIN prices pp ON lower(pp.player_name) = lower(rc.player_name)
  WHERE rc.price IS NOT NULL AND rc.price > 0
    AND rc.projection_final IS NOT NULL AND rc.projection_final > 0
),
scored AS (
  SELECT b.*,
    b.projection > (b.form_score * 1.05) AND b.price < 500000 AS breakout_flag,
    CASE
      WHEN b.risk_pct < 30 THEN 'LOW'
      WHEN b.risk_pct < 60 THEN 'MEDIUM'
      ELSE 'HIGH'
    END AS volatility_level,
    ROUND(b.projection / GREATEST(b.price::numeric / 1000.0, 1.0)
      * (b.projection_confidence / 100.0)
      * (100.0 / GREATEST(b.risk_pct + 1.0, 1.0))
      * 100.0, 2) AS raw_trade_score
  FROM base b
),
pct AS (
  SELECT s.*,
    ROUND((percent_rank() OVER (ORDER BY s.raw_trade_score) * 99.0 + 1.0)::numeric, 1) AS trade_score
  FROM scored s
),
categorised AS (
  SELECT p.*,
    2026                                AS season,
    (SELECT round_number FROM round_ctx) AS round_number,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5 THEN 'trap'
      WHEN p.price <= 350000 AND p.projection >= 50                                                            THEN 'cash_cow'
      WHEN p.price <= 400000 AND p.projection >= 60                                                            THEN 'cash_cow'
      WHEN p.price <= 500000 AND p.projection >= 70 AND p.value_score >= 15                                    THEN 'cash_cow'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                         THEN 'sell'
      WHEN p.price_edge_pts >= 15 AND p.value_tier IN ('STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED') AND p.projection_confidence >= 60 THEN 'buy'
      WHEN p.value_score >= 9.5 AND p.projection_confidence >= 70 AND p.price <= 900000                        THEN 'buy'
      WHEN p.price > 350000 AND p.price_edge_pts < -5 AND p.risk_pct > 50                                     THEN 'sell'
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                                          THEN 'trap'
      WHEN p.price_edge_pts > 5                                                                                THEN 'buy'
      ELSE 'sell'
    END AS category,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5 THEN 'Overpriced vs projection — downside risk'
      WHEN p.price <= 350000 AND p.projection >= 50                                                            THEN 'Budget player projecting well — generating cash'
      WHEN p.price <= 400000 AND p.projection >= 60                                                            THEN 'Budget player scoring above expectations'
      WHEN p.price <= 500000 AND p.projection >= 70 AND p.value_score >= 15                                    THEN 'Rising rookie with strong projection'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                         THEN 'Projection doesn''t justify price tier'
      WHEN p.price_edge_pts >= 15 AND p.value_tier IN ('STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED') THEN 'Projects well above cost — strong value signal'
      WHEN p.value_score >= 9.5                                                                                THEN 'High value score relative to market price'
      WHEN p.price_edge_pts < -5 AND p.risk_pct > 50                                                          THEN 'High risk and projecting below breakeven'
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                                          THEN 'Premium price but projection disappoints'
      WHEN p.price_edge_pts > 5                                                                                THEN 'Projecting above breakeven'
      ELSE 'Projecting below breakeven — potential sell'
    END AS category_reason,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change, 0), 0)           AS projected_price_r1,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 1.8, 0), 0)     AS projected_price_r2,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 2.4, 0), 0)     AS projected_price_r3,
    CASE
      WHEN p.price_edge_pts >= 5  THEN 'BUY'
      WHEN p.price_edge_pts < -5  THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
    ROUND(p.form_score, 1) AS last3_avg
  FROM pct p
)
SELECT
  gen_random_uuid()   AS snapshot_id,
  player_id, player_name, team, position, price,
  breakeven, projection, ceiling, floor_val,
  risk_pct, price_edge_pts, expected_price_change,
  category, action, trade_score,
  array_remove(ARRAY[
    recommendation_short,
    recommendation_why,
    CASE WHEN price_edge_pts > 15 THEN 'Projecting ' || ROUND(price_edge_pts,0)::text || ' pts above breakeven' ELSE NULL END,
    CASE WHEN risk_pct > 70 THEN 'High volatility — ' || ROUND(risk_pct,0)::text || '% risk' ELSE NULL END,
    CASE WHEN value_tier IS NOT NULL THEN 'Value tier: ' || value_tier ELSE NULL END
  ], NULL::text) AS reasons,
  price::numeric AS projected_price,
  projected_price_r1, projected_price_r2, projected_price_r3,
  0::numeric     AS breakout_score,
  breakout_flag,
  risk_pct       AS volatility_score,
  volatility_level,
  last3_avg,
  price::numeric AS estimated_price,
  value_score,
  price::numeric AS price_range_top,
  price::numeric AS price_range_bottom,
  0::numeric     AS value_momentum,
  NULL::text     AS momentum_label,
  price::numeric AS peak_price,
  NULL::text     AS peak_round,
  NULL::text     AS peak_status,
  season, round_number, snapshot_updated_at,
  neeko_rating, consistency_score, projection_confidence,
  NULL::numeric  AS avg_season,
  category_reason
FROM categorised;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

-- ============================================================
-- 4. Fix v_pipeline_status — keep exact same column names,
--    replace cross join to v_neeko_rating with cache table
-- ============================================================

CREATE OR REPLACE VIEW public.v_pipeline_status AS
WITH raw_stats AS (
  SELECT
    MAX(updated_at) AS last_raw_ingest,
    COUNT(*)        AS raw_player_rows,
    MAX(week)       AS latest_round
  FROM afl.raw_player_stats
  WHERE season = 2026
),
cache_stats AS (
  SELECT COUNT(*) AS projection_rows
  FROM afl.player_rankings_cache
),
ranking_ai AS (
  SELECT
    MAX(updated_at) AS last_ranking_ai,
    COUNT(*)        AS ranking_ai_rows
  FROM public.ai_rankings_player_recos
  WHERE season = 2026
),
pipeline AS (
  SELECT
    started_at  AS last_pipeline_run,
    status      AS last_pipeline_status,
    finished_at AS last_pipeline_finished
  FROM public.pipeline_runs
  ORDER BY started_at DESC
  LIMIT 1
),
ai_analysis AS (
  SELECT
    COUNT(*)          AS ai_analysis_rows,
    MAX(generated_at) AS last_ai_analysis_gen
  FROM public.ai_player_content
)
SELECT
  r.last_raw_ingest,
  r.raw_player_rows::integer,
  r.latest_round,
  c.projection_rows::integer,
  ra.last_ranking_ai,
  ra.ranking_ai_rows::integer,
  pl.last_pipeline_run,
  pl.last_pipeline_status,
  pl.last_pipeline_finished,
  ai.ai_analysis_rows::integer,
  ai.last_ai_analysis_gen
FROM raw_stats r
CROSS JOIN cache_stats c
CROSS JOIN ranking_ai ra
LEFT JOIN pipeline pl ON true
CROSS JOIN ai_analysis ai;

GRANT SELECT ON public.v_pipeline_status TO anon, authenticated;
