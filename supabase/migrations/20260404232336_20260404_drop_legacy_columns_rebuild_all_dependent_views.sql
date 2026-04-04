/*
  # Drop Legacy Columns — Rebuild All Dependent Views

  ## Summary
  Rebuilds all 19 views that depend on the legacy columns ai_recommendation,
  edge_score, and edge_tier in afl.player_rankings_cache, then drops those
  three columns permanently.

  ## Changes
  - Rebuilt views: v_top_projections, v_best_value, v_ai_data_parity_check,
    v_rankings_canonical, v_rankings_master, v_rankings_free, v_pipeline_observability,
    v_player_edge_scores, v_player_signals_master, v_player_lab_explorer,
    v_market_watch_signals, v_edge_board_safe, v_mw_premium (public), v_mw_free (public),
    afl.v_content_opportunities, afl.v_edge_board_core, afl.v_price_changes,
    market.v_mw_premium, market.v_mw_free

  ## Removed legacy columns
  - ai_recommendation: replaced by signal (5-level canonical) and recommendation_short
  - edge_score: replaced by edge (= projection_final - breakeven)
  - edge_tier: replaced by signal

  ## Security
  No RLS changes — views inherit security from base table grants.
*/

-- ============================================================
-- STEP 1: Drop all dependent views in correct dependency order
-- (leaf views first, then views that depend on other views)
-- ============================================================

-- Public wrappers that depend on market schema views
DROP VIEW IF EXISTS public.v_mw_free CASCADE;
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;

-- Public views that depend on afl views
DROP VIEW IF EXISTS public.v_edge_board_safe CASCADE;
DROP VIEW IF EXISTS public.v_market_watch_signals CASCADE;

-- afl schema views (depend on afl.player_rankings_cache directly)
DROP VIEW IF EXISTS afl.v_edge_board_core CASCADE;
DROP VIEW IF EXISTS market.v_mw_free CASCADE;
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;
DROP VIEW IF EXISTS afl.v_price_changes CASCADE;
DROP VIEW IF EXISTS afl.v_content_opportunities CASCADE;

-- Public views that depend on afl.player_rankings_cache directly
DROP VIEW IF EXISTS public.v_top_projections CASCADE;
DROP VIEW IF EXISTS public.v_best_value CASCADE;
DROP VIEW IF EXISTS public.v_ai_data_parity_check CASCADE;
DROP VIEW IF EXISTS public.v_rankings_canonical CASCADE;
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;
DROP VIEW IF EXISTS public.v_pipeline_observability CASCADE;
DROP VIEW IF EXISTS public.v_player_edge_scores CASCADE;
DROP VIEW IF EXISTS public.v_player_signals_master CASCADE;
DROP VIEW IF EXISTS public.v_player_lab_explorer CASCADE;

-- ============================================================
-- STEP 2: Drop the legacy columns
-- ============================================================

ALTER TABLE afl.player_rankings_cache DROP COLUMN IF EXISTS ai_recommendation;
ALTER TABLE afl.player_rankings_cache DROP COLUMN IF EXISTS edge_score;
ALTER TABLE afl.player_rankings_cache DROP COLUMN IF EXISTS edge_tier;

-- ============================================================
-- STEP 3: Recreate afl schema base views (no legacy fields)
-- ============================================================

CREATE OR REPLACE VIEW afl.v_price_changes AS
WITH ordered_prices AS (
  SELECT pph.player_id,
    pph.price,
    pph.position,
    pph.round_number,
    pph.season,
    lag(pph.price) OVER (PARTITION BY pph.player_id, pph.season ORDER BY pph.round_number) AS prev_price,
    lag(pph.round_number) OVER (PARTITION BY pph.player_id, pph.season ORDER BY pph.round_number) AS prev_round,
    row_number() OVER (PARTITION BY pph.player_id, pph.season ORDER BY pph.round_number DESC) AS rn
  FROM afl.player_price_history pph
  WHERE pph.season = 2026
),
latest AS (
  SELECT * FROM ordered_prices WHERE rn = 1
)
SELECT
  l.player_id,
  l.price AS current_price,
  l.prev_price AS previous_price,
  l.round_number AS current_round,
  l.prev_round AS previous_round,
  (l.price - COALESCE(l.prev_price, l.price)) AS price_change,
  CASE
    WHEN COALESCE(l.prev_price, 0) > 0
    THEN round(((l.price - l.prev_price)::numeric / l.prev_price::numeric * 100.0), 2)
    ELSE 0::numeric
  END AS price_change_pct,
  l.position,
  COALESCE(r.projection_final, 0::numeric) AS projection,
  COALESCE(r.value_score, 0::double precision)::numeric AS value_score,
  COALESCE(r.neeko_rating, 0::double precision)::numeric AS neeko_rating,
  COALESCE(r.player_name, 'Unknown') AS player_name,
  r.team,
  r.signal,
  r.recommendation_short,
  COALESCE(r.breakeven, 0::numeric) AS breakeven,
  round((COALESCE(r.projection_final, 0::numeric) - COALESCE(r.breakeven, 0::numeric)), 1) AS price_edge
FROM latest l
LEFT JOIN afl.player_rankings_cache r ON r.player_id = l.player_id
WHERE COALESCE(l.price, 0) > 0;

CREATE OR REPLACE VIEW afl.v_edge_board_core AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  position,
  price,
  prev_price,
  price_change,
  projection_final,
  breakeven,
  edge,
  value_score,
  neeko_rating,
  consistency,
  projection_confidence,
  games_played,
  signal,
  market_watch_category,
  summary_short,
  recommendation_short,
  recommendation_color,
  matchup_label,
  ceiling,
  floor,
  form_score,
  status,
  manual_status,
  is_available,
  is_bye,
  ((COALESCE(status, '') = 'injured') OR (COALESCE(manual_status, '') = 'injured')) AS is_injured,
  cached_at,
  signal AS edge_tier,
  ((price IS NOT NULL) AND (price > 0)
    AND (projection_final IS NOT NULL) AND (projection_final::double precision > 30)
    AND (games_played >= 3)
    AND (player_name IS NOT NULL)
    AND (team IS NOT NULL) AND (team <> '')
    AND (COALESCE(is_available, true) = true)
    AND (COALESCE(status, 'AVAILABLE') <> ALL (ARRAY['OUT', 'INJURED']))
    AND (COALESCE(manual_status, 'AVAILABLE') <> ALL (ARRAY['OUT', 'INJURED', 'INACTIVE', 'injured', 'bye']))
    AND (is_bye IS NOT TRUE)
  ) AS is_valid_edge_candidate
FROM afl.player_rankings_cache rc
WHERE (player_id IS NOT NULL)
  AND (player_name IS NOT NULL)
  AND (projection_final IS NOT NULL)
  AND (projection_final::double precision > 30)
  AND (COALESCE(is_available, true) = true)
  AND (COALESCE(status, 'AVAILABLE') <> ALL (ARRAY['OUT', 'INJURED']))
  AND (COALESCE(manual_status, 'AVAILABLE') <> ALL (ARRAY['OUT', 'INJURED', 'INACTIVE', 'injured', 'bye']))
  AND (is_bye IS NOT TRUE);

CREATE OR REPLACE VIEW afl.v_content_opportunities AS
WITH available AS (
  SELECT
    player_id, player_name, team, position, position_group,
    projection_final, ceiling, floor, price, value_score, best_value_score,
    form_score, consistency, captain_score, captain_rating, risk_rating,
    upside_pct, neeko_rating_scaled, signal, recommendation_color,
    summary_short, summary_long, market_watch_category, price_change, price_change_pct
  FROM afl.player_rankings_cache
  WHERE (is_available = true)
    AND ((is_bye IS NULL) OR (is_bye = false))
    AND ((manual_status IS NULL) OR (manual_status <> ALL (ARRAY['injured', 'omitted', 'suspended', 'inactive'])))
    AND (projection_final IS NOT NULL)
    AND (player_name IS NOT NULL)
),
percentiles AS (
  SELECT
    percentile_cont(0.90) WITHIN GROUP (ORDER BY value_score) AS p90_value,
    percentile_cont(0.85) WITHIN GROUP (ORDER BY form_score) AS p85_form,
    percentile_cont(0.85) WITHIN GROUP (ORDER BY upside_pct) AS p85_upside,
    percentile_cont(0.70) WITHIN GROUP (ORDER BY risk_rating) AS p70_risk,
    percentile_cont(0.30) WITHIN GROUP (ORDER BY value_score) AS p30_value,
    percentile_cont(0.20) WITHIN GROUP (ORDER BY consistency) AS p20_consistency
  FROM available
),
value_picks AS (
  SELECT a.*, 'value' AS category,
    'Value ' || round(a.value_score::numeric, 1)::text || ' · proj ' || round(a.projection_final)::text || 'pts' AS signal_reason,
    row_number() OVER (ORDER BY a.value_score DESC NULLS LAST) AS cat_rank
  FROM available a, percentiles p
  WHERE a.value_score >= p.p90_value
),
breakout_picks AS (
  SELECT a.*, 'breakout' AS category,
    'Form ' || round(a.form_score::numeric)::text || ' · upside ' || round(a.upside_pct::numeric)::text || '%' AS signal_reason,
    row_number() OVER (ORDER BY (COALESCE(a.form_score, 0) + COALESCE(a.upside_pct, 0)) DESC NULLS LAST) AS cat_rank
  FROM available a, percentiles p
  WHERE (a.form_score >= p.p85_form) AND (a.upside_pct >= 15)
),
trap_picks AS (
  SELECT a.*, 'trap' AS category,
    'Risk ' || round(a.risk_rating::numeric)::text || ' · value ' || round(a.value_score::numeric, 1)::text || ' · proj ' || round(a.projection_final)::text || 'pts' AS signal_reason,
    row_number() OVER (ORDER BY a.risk_rating DESC NULLS LAST) AS cat_rank
  FROM available a, percentiles p
  WHERE (a.risk_rating >= p.p70_risk) AND (a.value_score <= p.p30_value)
),
captain_picks AS (
  SELECT a.*, 'captain' AS category,
    'Cap score ' || round(a.captain_score::numeric)::text || ' · proj ' || round(a.projection_final)::text || 'pts · form ' || round(a.form_score::numeric)::text AS signal_reason,
    row_number() OVER (ORDER BY a.captain_score DESC NULLS LAST) AS cat_rank
  FROM available a
  WHERE (a.captain_score IS NOT NULL) AND (a.captain_score >= 60)
),
elite_picks AS (
  SELECT a.*, 'elite' AS category,
    'Neeko ' || round(a.neeko_rating_scaled::numeric, 1)::text || ' · proj ' || round(a.projection_final)::text || 'pts · ceiling ' || round(a.ceiling::numeric)::text AS signal_reason,
    row_number() OVER (ORDER BY a.neeko_rating_scaled DESC NULLS LAST) AS cat_rank
  FROM available a
  WHERE (a.neeko_rating_scaled IS NOT NULL) AND (a.neeko_rating_scaled >= 85)
),
all_opps AS (
  SELECT * FROM value_picks WHERE cat_rank <= 10
  UNION ALL
  SELECT * FROM breakout_picks WHERE cat_rank <= 10
  UNION ALL
  SELECT * FROM trap_picks WHERE cat_rank <= 10
  UNION ALL
  SELECT * FROM captain_picks WHERE cat_rank <= 10
  UNION ALL
  SELECT * FROM elite_picks WHERE cat_rank <= 10
)
SELECT
  player_id, player_name, team, position, position_group,
  projection_final, ceiling, floor, price, value_score, best_value_score,
  form_score, consistency, captain_score, captain_rating, risk_rating,
  upside_pct, neeko_rating_scaled, signal, recommendation_color,
  summary_short, summary_long, market_watch_category, price_change, price_change_pct,
  category, signal_reason, cat_rank
FROM all_opps
ORDER BY category, cat_rank;

-- ============================================================
-- STEP 4: Recreate market schema views (no ai_recommendation)
-- ============================================================

CREATE OR REPLACE VIEW market.v_mw_premium AS
SELECT
  (gen_random_uuid())::text AS snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection_final AS projection,
  ceiling,
  floor AS floor_val,
  risk_rating AS risk_pct,
  round((projection_final - breakeven), 2) AS value_gap,
  signal_tag,
  signal,
  CASE WHEN signal_tag = 'TARGET' THEN 'BUY'
       WHEN signal_tag = 'AVOID'  THEN 'SELL'
       ELSE 'HOLD'
  END AS category,
  CASE WHEN signal_tag = 'TARGET' THEN 'BUY'
       WHEN signal_tag = 'AVOID'  THEN 'SELL'
       ELSE 'HOLD'
  END AS action,
  recommendation_short,
  summary_short,
  summary_long,
  matchup_label,
  prev_price,
  price_change,
  consistency,
  projection_confidence,
  neeko_rating,
  status,
  manual_status,
  is_bye,
  false AS is_injured,
  COALESCE(cached_at, now()) AS snapshot_updated_at,
  2026 AS season,
  1 AS round_number
FROM afl.player_rankings_cache rc
WHERE (is_available = true)
  AND (projection_final IS NOT NULL) AND (projection_final > 0::numeric)
  AND (price IS NOT NULL) AND (price > 0)
  AND ((is_bye IS NULL) OR (is_bye = false))
  AND (signal IS NOT NULL)
ORDER BY
  CASE signal_tag WHEN 'TARGET' THEN 1 WHEN 'WATCH' THEN 2 WHEN 'AVOID' THEN 3 ELSE 4 END,
  (projection_final - breakeven) DESC NULLS LAST
LIMIT 300;

CREATE OR REPLACE VIEW market.v_mw_free AS
WITH base AS (
  SELECT
    (gen_random_uuid())::text AS snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    rc.breakeven,
    rc.projection_final AS projection,
    rc.ceiling,
    rc.floor AS floor_val,
    rc.risk_rating AS risk_pct,
    round((rc.projection_final - rc.breakeven), 2) AS value_gap,
    rc.signal_tag,
    rc.signal,
    CASE WHEN rc.signal_tag = 'TARGET' THEN 'BUY'
         WHEN rc.signal_tag = 'AVOID'  THEN 'SELL'
         ELSE 'HOLD'
    END AS category,
    CASE WHEN rc.signal_tag = 'TARGET' THEN 'BUY'
         WHEN rc.signal_tag = 'AVOID'  THEN 'SELL'
         ELSE 'HOLD'
    END AS action,
    rc.recommendation_short,
    rc.summary_short,
    rc.summary_long,
    rc.matchup_label,
    rc.prev_price,
    rc.price_change,
    rc.consistency,
    rc.projection_confidence,
    rc.neeko_rating,
    rc.status,
    rc.manual_status,
    rc.is_bye,
    false AS is_injured,
    COALESCE(rc.cached_at, now()) AS snapshot_updated_at,
    2026 AS season,
    1 AS round_number
  FROM afl.player_rankings_cache rc
  WHERE (rc.is_available = true)
    AND (rc.projection_final IS NOT NULL) AND (rc.projection_final > 0::numeric)
    AND (rc.price IS NOT NULL) AND (rc.price > 0)
    AND ((rc.is_bye IS NULL) OR (rc.is_bye = false))
    AND (rc.signal IS NOT NULL)
),
targets AS (
  SELECT *, row_number() OVER (ORDER BY value_gap DESC) AS rn FROM base WHERE signal_tag = 'TARGET'
),
watches AS (
  SELECT *, row_number() OVER (ORDER BY value_gap DESC) AS rn FROM base WHERE signal_tag = 'WATCH'
),
avoids AS (
  SELECT *, row_number() OVER (ORDER BY value_gap) AS rn FROM base WHERE signal_tag = 'AVOID'
),
combined AS (
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven, projection,
    ceiling, floor_val, risk_pct, value_gap, signal_tag, signal, category, action,
    recommendation_short, summary_short, summary_long, matchup_label, prev_price, price_change,
    consistency, projection_confidence, neeko_rating, status, manual_status,
    is_bye, is_injured, snapshot_updated_at, season, round_number
  FROM targets WHERE rn <= 30
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven, projection,
    ceiling, floor_val, risk_pct, value_gap, signal_tag, signal, category, action,
    recommendation_short, summary_short, summary_long, matchup_label, prev_price, price_change,
    consistency, projection_confidence, neeko_rating, status, manual_status,
    is_bye, is_injured, snapshot_updated_at, season, round_number
  FROM watches WHERE rn <= 40
  UNION ALL
  SELECT snapshot_id, player_id, player_name, team, position, price, breakeven, projection,
    ceiling, floor_val, risk_pct, value_gap, signal_tag, signal, category, action,
    recommendation_short, summary_short, summary_long, matchup_label, prev_price, price_change,
    consistency, projection_confidence, neeko_rating, status, manual_status,
    is_bye, is_injured, snapshot_updated_at, season, round_number
  FROM avoids WHERE rn <= 30
)
SELECT * FROM combined
ORDER BY value_gap DESC NULLS LAST, projection DESC NULLS LAST;

-- ============================================================
-- STEP 5: Recreate public schema views (no legacy fields)
-- ============================================================

CREATE OR REPLACE VIEW public.v_top_projections AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, projection, ceiling, floor, consistency, form_score, neeko_rating,
  best_value_score, price, value_score, value_tag, projection_confidence, risk_rating,
  matchup_rating, matchup_label, matchup_multiplier, games_played,
  signal, recommendation_color, recommendation_short, recommendation_why,
  ai_summary, ai_updated_at, consistency_tier, total_count, cached_at
FROM afl.player_rankings_cache c
ORDER BY projection_final DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_best_value AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, projection, ceiling, floor, ceiling_estimate, floor_estimate,
  consistency, form_score, neeko_rating, price, value_score, value_tag, value_tier,
  signal, summary, analysis, projection_confidence, risk_rating,
  matchup_rating, upside_rating, captain_score, captain_rating,
  recommendation_color, recommendation_short, recommendation_why, ai_summary, ai_updated_at,
  consistency_tier, total_count, cached_at, best_value_score, games_played,
  matchup_multiplier, matchup_label
FROM afl.player_rankings_cache
WHERE (projection_final >= 75::numeric) AND (price IS NOT NULL) AND (price > 0)
ORDER BY best_value_score DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_ai_data_parity_check AS
SELECT
  c.player_id, c.player_name, c.team, c.position,
  c.projection_final AS cache_projection,
  c.value_score AS cache_value_score,
  c.neeko_rating_scaled AS cache_neeko_rating,
  c.recommendation_short AS cache_reco_short,
  c.signal AS cache_signal,
  aia.summary_short AS ai_summary_short,
  aia.summary_long AS ai_summary_long,
  aia.generated_at AS ai_generated_at,
  aia.input_hash AS ai_input_hash,
  r.recommendation_label AS structured_label,
  r.recommendation_short AS structured_short,
  r.recommendation_long AS structured_long,
  r.updated_at AS structured_updated_at,
  CASE
    WHEN aia.player_id IS NULL THEN 'NO_AI_SUMMARY'
    WHEN r.player_id IS NULL   THEN 'NO_STRUCTURED_RECO'
    ELSE 'COMPLETE'
  END AS parity_status
FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis aia ON aia.player_id = c.player_id
LEFT JOIN ai_rankings_player_recos r ON r.player_id = c.player_id
ORDER BY c.neeko_rating_scaled DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_rankings_canonical AS
SELECT
  player_id, player_name, team, position, ceiling AS ceiling_estimate,
  projection_final, neeko_rating, price, value_score, projection_confidence,
  risk_rating, upside_rating, captain_score, captain_rating, signal,
  recommendation_short, recommendation_color, consistency_tier, cached_at, confidence_label
FROM afl.player_rankings_cache c;

CREATE OR REPLACE VIEW public.v_rankings_master AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, projection, ceiling, floor, ceiling_estimate, floor_estimate,
  consistency, form_score, neeko_rating, neeko_rating_raw, neeko_rating_scaled,
  price, value_score, value_tag, value_tier, best_value_score,
  matchup_multiplier, matchup_rating, matchup_label, games_played,
  upside_pct, upside_rating, signal, edge, baseline,
  recommendation_color, recommendation_strength, market_watch_category,
  captain_score, captain_rating, ai_summary, summary, analysis,
  recommendation_short, recommendation_why, ai_prompt_version, ai_validation_passed,
  ai_generated_at, projection_confidence, risk_rating, confidence_label, consistency_tier,
  prev_price, price_change, price_change_pct, breakeven,
  bye_round, is_bye, bye_next_round, team_id, is_available, status, manual_status,
  cache_snapshot_id, cached_at, total_count
FROM afl.player_rankings_cache c
WHERE is_available = true;

CREATE OR REPLACE VIEW public.v_rankings_free AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, projection, ceiling, floor, consistency, form_score, neeko_rating,
  price, value_score, value_tag, value_tier, matchup_rating, matchup_label, games_played,
  edge, signal, signal_tag, baseline, breakeven, season_avg, last_3_avg,
  recommendation_color, recommendation_strength, summary_short,
  market_watch_category, captain_score, captain_rating,
  projection_confidence, confidence_label, consistency_tier,
  upside_pct, upside_rating, prev_price, price_change, price_change_pct,
  bye_round, is_bye, bye_next_round, is_available, status, manual_status, cached_at
FROM afl.player_rankings_cache
WHERE (projection_final IS NOT NULL)
  AND (breakeven IS NOT NULL)
  AND (edge IS NOT NULL)
  AND (signal IS NOT NULL)
  AND (value_score IS NOT NULL)
  AND (COALESCE(is_available, true) = true)
  AND (COALESCE(manual_status, 'AVAILABLE') <> ALL (ARRAY['inactive', 'INACTIVE', 'INACTIVE_GHOST', 'inactive_ghost']))
ORDER BY projection_final DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_pipeline_observability AS
WITH ingestion_stats AS (
  SELECT
    max(pr.started_at) AS last_ingestion_run,
    max(pr.finished_at) AS last_ingestion_finished,
    EXTRACT(epoch FROM (now() - max(pr.finished_at))) / 3600::numeric AS hours_since_ingestion,
    count(*) FILTER (WHERE pr.status = ANY (ARRAY['complete', 'success']) AND pr.started_at > now() - interval '24 hours') AS runs_last_24h
  FROM pipeline_runs pr
  WHERE pr.pipeline_key = 'afl_ingestion' AND pr.status = ANY (ARRAY['complete', 'success', 'partial'])
),
game_coverage AS (
  SELECT
    count(g.game_id) AS total_ft_games,
    sum(CASE WHEN COALESCE(cnt.player_count, 0) >= 30 THEN 1 ELSE 0 END) AS games_fully_ingested,
    sum(CASE WHEN COALESCE(cnt.player_count, 0) = 0 THEN 1 ELSE 0 END) AS games_missing_stats,
    sum(CASE WHEN COALESCE(cnt.player_count, 0) BETWEEN 1 AND 29 THEN 1 ELSE 0 END) AS games_partial_stats
  FROM afl.games_raw g
  LEFT JOIN (SELECT raw_player_stats.game_id, count(*) AS player_count FROM afl.raw_player_stats GROUP BY 1) cnt ON cnt.game_id = g.game_id
  WHERE g.season = 2026 AND g.status_short = 'FT'
),
cache_stats AS (
  SELECT
    count(*) AS cached_players,
    max(cached_at) AS cache_last_updated,
    EXTRACT(epoch FROM (now() - max(cached_at))) / 3600::numeric AS cache_hours_old,
    count(*) FILTER (WHERE projection IS NOT NULL AND projection > 0) AS players_with_projection,
    count(*) FILTER (WHERE signal IS NOT NULL AND signal <> '') AS with_signal,
    count(*) FILTER (WHERE ai_summary IS NOT NULL AND ai_summary <> '') AS with_ai_summary,
    count(*) FILTER (WHERE ai_generated_at > now() - interval '7 days') AS fresh_ai_count
  FROM afl.player_rankings_cache
),
pipeline_health AS (
  SELECT
    count(*) FILTER (WHERE status = ANY (ARRAY['complete', 'success']) AND started_at > now() - interval '48 hours') AS successful_runs_48h,
    count(*) FILTER (WHERE status = 'error' AND started_at > now() - interval '48 hours') AS error_runs_48h,
    count(*) FILTER (WHERE status = 'partial' AND started_at > now() - interval '48 hours') AS partial_runs_48h,
    max(started_at) AS last_any_run
  FROM pipeline_runs
)
SELECT
  i.last_ingestion_run, i.last_ingestion_finished,
  round(i.hours_since_ingestion, 1) AS hours_since_ingestion,
  i.runs_last_24h,
  gc.total_ft_games, gc.games_fully_ingested, gc.games_missing_stats, gc.games_partial_stats,
  CASE WHEN gc.total_ft_games = 0 THEN 0::numeric
       ELSE round(gc.games_fully_ingested::numeric / NULLIF(gc.total_ft_games, 0)::numeric * 100, 1)
  END AS game_coverage_pct,
  c.cached_players, c.cache_last_updated,
  round(c.cache_hours_old, 1) AS cache_hours_old,
  c.players_with_projection, c.with_signal, c.with_ai_summary, c.fresh_ai_count,
  CASE WHEN c.cached_players = 0 THEN 0::numeric
       ELSE round(c.with_signal::numeric / NULLIF(c.cached_players, 0)::numeric * 100, 1)
  END AS signal_coverage_pct,
  ph.successful_runs_48h, ph.error_runs_48h, ph.partial_runs_48h, ph.last_any_run,
  CASE
    WHEN gc.games_missing_stats > 0 THEN 'degraded'
    WHEN gc.games_partial_stats > 0 THEN 'degraded'
    WHEN i.hours_since_ingestion > 48 THEN 'stale'
    WHEN c.cache_hours_old > 24 THEN 'stale'
    WHEN ph.error_runs_48h > 0 AND ph.successful_runs_48h = 0 THEN 'error'
    WHEN c.with_signal < 100 THEN 'degraded'
    ELSE 'healthy'
  END AS overall_health,
  now() AS checked_at
FROM ingestion_stats i
CROSS JOIN game_coverage gc
CROSS JOIN cache_stats c
CROSS JOIN pipeline_health ph;

CREATE OR REPLACE VIEW public.v_player_edge_scores AS
SELECT
  player_id, player_name, team, position,
  edge,
  signal,
  recommendation_color,
  projection_final,
  value_score,
  market_watch_category,
  is_available
FROM afl.player_rankings_cache c
WHERE is_available = true
ORDER BY edge DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_player_signals_master AS
SELECT
  player_id, player_name, team, position,
  projection_final, edge, signal, value_score,
  recommendation_color, form_score, consistency, breakeven,
  price, market_watch_category, is_available, cached_at
FROM afl.player_rankings_cache c
WHERE is_available = true;

CREATE OR REPLACE VIEW public.v_player_lab_explorer AS
SELECT
  player_id, player_name, team, position,
  projection_final, projection, ceiling, floor, form_score, consistency,
  neeko_rating, price, value_score, edge, signal,
  recommendation_color, matchup_rating, matchup_label,
  upside_pct, breakeven, games_played, bye_round, is_bye,
  status, is_available, cached_at
FROM afl.player_rankings_cache c;

-- ============================================================
-- STEP 6: Recreate public wrappers for market schema views
-- ============================================================

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT
  snapshot_id, player_id, player_name, team, position,
  price, breakeven, projection, ceiling, floor_val, risk_pct, value_gap,
  signal_tag, signal, category, action,
  recommendation_short, summary_short, summary_long, matchup_label,
  prev_price, price_change, consistency, projection_confidence, neeko_rating,
  status, manual_status, is_bye, is_injured, snapshot_updated_at, season, round_number
FROM market.v_mw_premium;

CREATE OR REPLACE VIEW public.v_mw_free AS
SELECT
  snapshot_id, player_id, player_name, team, position,
  price, breakeven, projection, ceiling, floor_val, risk_pct, value_gap,
  signal_tag, signal, category, action,
  recommendation_short, summary_short, summary_long, matchup_label,
  prev_price, price_change, consistency, projection_confidence, neeko_rating,
  status, manual_status, is_bye, is_injured, snapshot_updated_at, season, round_number
FROM market.v_mw_free;

-- ============================================================
-- STEP 7: Recreate public.v_edge_board_safe using edge/signal
-- ============================================================

CREATE OR REPLACE VIEW public.v_edge_board_safe AS
WITH ranked AS (
  SELECT
    player_id, player_name, team, position, price, projection_final, breakeven,
    edge, value_score, neeko_rating, consistency, games_played,
    signal, summary_short, recommendation_short, recommendation_color,
    is_injured, cached_at, is_valid_edge_candidate
  FROM afl.v_edge_board_core
  WHERE is_valid_edge_candidate = true AND is_injured = false
),
captain AS (
  SELECT *, 'captain' AS signal_type
  FROM ranked
  WHERE (signal = ANY (ARRAY['STRONG_BUY', 'BUY'])) AND (projection_final::double precision >= 60)
  ORDER BY edge DESC
  LIMIT 1
),
breakout AS (
  SELECT *, 'breakout' AS signal_type
  FROM ranked
  WHERE (signal = ANY (ARRAY['STRONG_BUY', 'BUY']))
    AND (value_score >= 5)
    AND (player_id NOT IN (SELECT player_id FROM captain))
  ORDER BY value_score DESC
  LIMIT 1
),
trap AS (
  SELECT *, 'trap' AS signal_type
  FROM ranked
  WHERE (signal = ANY (ARRAY['STRONG_SELL', 'SELL']))
    AND (price >= 300000)
    AND (player_id NOT IN (SELECT player_id FROM captain))
    AND (player_id NOT IN (SELECT player_id FROM breakout))
  ORDER BY edge ASC
  LIMIT 1
)
SELECT player_id, player_name, team, position, price, projection_final, breakeven,
  edge, value_score, neeko_rating, consistency, games_played,
  signal, summary_short, recommendation_short, recommendation_color,
  is_injured, cached_at, is_valid_edge_candidate, signal_type
FROM captain
UNION ALL
SELECT player_id, player_name, team, position, price, projection_final, breakeven,
  edge, value_score, neeko_rating, consistency, games_played,
  signal, summary_short, recommendation_short, recommendation_color,
  is_injured, cached_at, is_valid_edge_candidate, signal_type
FROM breakout
UNION ALL
SELECT player_id, player_name, team, position, price, projection_final, breakeven,
  edge, value_score, neeko_rating, consistency, games_played,
  signal, summary_short, recommendation_short, recommendation_color,
  is_injured, cached_at, is_valid_edge_candidate, signal_type
FROM trap;

-- ============================================================
-- STEP 8: Recreate v_market_watch_signals using signal column
-- ============================================================

CREATE OR REPLACE VIEW public.v_market_watch_signals AS
WITH thresholds AS (
  SELECT
    percentile_cont(0.25) WITHIN GROUP (ORDER BY value_score)::numeric AS vs_p25,
    percentile_cont(0.60) WITHIN GROUP (ORDER BY value_score)::numeric AS vs_p60,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value_score)::numeric AS vs_p75,
    percentile_cont(0.60) WITHIN GROUP (ORDER BY projection_final::double precision)::numeric AS proj_p60,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY projection_final::double precision)::numeric AS proj_p75
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL AND projection_final IS NOT NULL AND projection_final > 0::numeric
),
raw AS (
  SELECT
    pc.player_id, pc.player_name, pc.team, pc.position,
    pc.current_price, pc.previous_price, pc.price_change, pc.price_change_pct,
    pc.current_round, pc.previous_round, pc.projection, pc.value_score,
    pc.neeko_rating, pc.price_edge, pc.breakeven, pc.signal, pc.recommendation_short,
    t.vs_p25, t.vs_p60,
    CASE
      WHEN (pc.current_price < 450000 AND pc.price_change >= 10000 AND pc.price_edge >= 3 AND pc.projection >= 38) THEN 'CASH_COW'
      WHEN (pc.current_price BETWEEN 300000 AND 750000 AND pc.price_change >= -5000 AND pc.price_edge >= 5 AND pc.value_score >= t.vs_p60) THEN 'BUY_BEFORE_RISE'
      WHEN (pc.price_edge <= -15 AND pc.value_score <= t.vs_p25 AND pc.price_change <= 0) THEN 'SELL_BEFORE_DROP'
      WHEN (pc.price_change <= -50000 AND pc.price_edge <= -10) THEN 'SELL_BEFORE_DROP'
      WHEN (pc.current_price >= 700000 AND pc.price_edge <= -8 AND pc.value_score <= t.vs_p25) THEN 'FADE_TRAP'
      WHEN (pc.price_change >= 10000) THEN 'PRICE_RISE'
      WHEN (pc.price_change <= -10000) THEN 'PRICE_DROP'
      ELSE NULL
    END AS raw_signal
  FROM afl.v_price_changes pc
  CROSS JOIN thresholds t
  WHERE pc.current_price > 0 AND pc.projection > 0
),
ranked AS (
  SELECT *,
    percent_rank() OVER (PARTITION BY raw_signal ORDER BY
      CASE raw_signal
        WHEN 'CASH_COW'        THEN price_change::numeric + price_edge * 5000
        WHEN 'BUY_BEFORE_RISE' THEN value_score * 10000 + price_edge * 3000
        WHEN 'SELL_BEFORE_DROP' THEN -(price_edge * 3000 + value_score * 10000)
        WHEN 'FADE_TRAP'       THEN -(value_score * 10000 + price_edge * 3000)
        WHEN 'PRICE_RISE'      THEN price_change::numeric
        WHEN 'PRICE_DROP'      THEN -price_change::numeric
        ELSE 0
      END DESC) AS signal_rank_pct
  FROM raw
  WHERE raw_signal IS NOT NULL
)
SELECT
  player_id, player_name, team, position AS player_position,
  current_price AS price, previous_price, price_change, price_change_pct,
  current_round, previous_round, projection, value_score, neeko_rating,
  price_edge, breakeven, signal, recommendation_short,
  raw_signal AS signal_type,
  round(signal_rank_pct::numeric * 100, 1) AS signal_rank_pct
FROM ranked
WHERE CASE raw_signal
  WHEN 'CASH_COW'        THEN signal_rank_pct <= 0.15
  WHEN 'BUY_BEFORE_RISE' THEN signal_rank_pct <= 0.12
  WHEN 'SELL_BEFORE_DROP' THEN signal_rank_pct <= 0.12
  WHEN 'FADE_TRAP'       THEN signal_rank_pct <= 0.10
  WHEN 'PRICE_RISE'      THEN signal_rank_pct <= 0.10
  WHEN 'PRICE_DROP'      THEN signal_rank_pct <= 0.10
  ELSE false
END
ORDER BY raw_signal, round(signal_rank_pct::numeric * 100, 1);

-- ============================================================
-- STEP 9: Grant read access on rebuilt views
-- ============================================================

GRANT SELECT ON public.v_top_projections TO anon, authenticated;
GRANT SELECT ON public.v_best_value TO anon, authenticated;
GRANT SELECT ON public.v_ai_data_parity_check TO authenticated;
GRANT SELECT ON public.v_rankings_canonical TO anon, authenticated;
GRANT SELECT ON public.v_rankings_master TO authenticated;
GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
GRANT SELECT ON public.v_pipeline_observability TO authenticated;
GRANT SELECT ON public.v_player_edge_scores TO anon, authenticated;
GRANT SELECT ON public.v_player_signals_master TO anon, authenticated;
GRANT SELECT ON public.v_player_lab_explorer TO authenticated;
GRANT SELECT ON public.v_mw_premium TO authenticated;
GRANT SELECT ON public.v_mw_free TO anon, authenticated;
GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
GRANT SELECT ON public.v_market_watch_signals TO authenticated;
GRANT SELECT ON afl.v_edge_board_core TO authenticated;
GRANT SELECT ON afl.v_content_opportunities TO authenticated;
GRANT SELECT ON afl.v_price_changes TO authenticated;
GRANT SELECT ON market.v_mw_premium TO authenticated;
GRANT SELECT ON market.v_mw_free TO anon, authenticated;
