/*
  # Rebuild Market Watch Views from Canonical Cache

  ## Summary
  Drop and recreate market.v_mw_premium, market.v_mw_free, and public wrappers
  to read exclusively from afl.player_rankings_cache using canonical columns.
  Signal → Category → Action is fully deterministic — no AI override.

  ## Changes
  - DROP + CREATE all market watch views
  - All views now use signal_canonical, category_canonical, action_canonical
  - market_watch_category always equals category_canonical
  - Ordered by ABS(value_score_canonical) DESC

  ## Security
  - GRANT SELECT to anon + authenticated
*/

-- Drop all dependent views first
DROP VIEW IF EXISTS public.v_mw_summary_cards CASCADE;
DROP VIEW IF EXISTS public.v_mw_summary CASCADE;
DROP VIEW IF EXISTS public.v_mw_status CASCADE;
DROP VIEW IF EXISTS public.v_mw_best_trades CASCADE;
DROP VIEW IF EXISTS public.v_mw_diagnostics CASCADE;
DROP VIEW IF EXISTS public.v_mw_category_counts CASCADE;
DROP VIEW IF EXISTS public.v_market_watch_signals CASCADE;
DROP VIEW IF EXISTS market.v_mw_free CASCADE;
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;
DROP VIEW IF EXISTS market.v_mw_summary CASCADE;
DROP VIEW IF EXISTS market.v_mw_diagnostics CASCADE;
DROP VIEW IF EXISTS market.v_mw_category_counts CASCADE;
DROP VIEW IF EXISTS market.v_market_watch_free CASCADE;

-- ============================================================
-- market.v_mw_premium — all qualifying players
-- ============================================================
CREATE VIEW market.v_mw_premium AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team_name                                                 AS team,
  rc.team_name,
  rc.position,
  rc.price,
  rc.prev_price,
  rc.price_change,
  rc.price_change_pct,
  rc.projection_final,
  rc.season_avg,
  rc.last_3_avg,
  rc.last_5_avg,
  rc.games_played,
  rc.breakeven_canonical                                       AS breakeven,
  rc.edge_canonical                                            AS edge,
  rc.value_score_canonical                                     AS value_score,
  rc.signal_canonical                                          AS signal,
  rc.signal_canonical                                          AS signal_tag,
  rc.category_canonical                                        AS category,
  rc.category_canonical                                        AS market_watch_category,
  rc.action_canonical                                          AS action,
  rc.status,
  rc.is_bye,
  rc.summary_short,
  rc.summary_long,
  rc.neeko_rating,
  rc.consistency,
  rc.form_score,
  rc.matchup_rating,
  rc.matchup_multiplier,
  rc.breakeven_canonical,
  rc.edge_canonical,
  rc.value_score_canonical,
  rc.signal_canonical,
  rc.category_canonical,
  rc.action_canonical,
  rc.cached_at
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('injured', 'delisted')
  AND rc.projection_final > 0
  AND rc.price > 0
ORDER BY ABS(rc.value_score_canonical) DESC NULLS LAST;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;

-- ============================================================
-- market.v_mw_free — top 2 per category
-- ============================================================
CREATE VIEW market.v_mw_free AS
WITH ranked AS (
  SELECT
    rc.player_id,
    rc.player_name,
    rc.team_name                                               AS team,
    rc.team_name,
    rc.position,
    rc.price,
    rc.projection_final,
    rc.season_avg,
    rc.last_3_avg,
    rc.last_5_avg,
    rc.games_played,
    rc.breakeven_canonical                                     AS breakeven,
    rc.edge_canonical                                          AS edge,
    rc.value_score_canonical                                   AS value_score,
    rc.signal_canonical                                        AS signal,
    rc.signal_canonical                                        AS signal_tag,
    rc.category_canonical                                      AS category,
    rc.category_canonical                                      AS market_watch_category,
    rc.action_canonical                                        AS action,
    rc.status,
    rc.is_bye,
    rc.summary_short,
    rc.neeko_rating,
    rc.breakeven_canonical,
    rc.edge_canonical,
    rc.value_score_canonical,
    rc.signal_canonical,
    rc.category_canonical,
    rc.action_canonical,
    rc.cached_at,
    ROW_NUMBER() OVER (
      PARTITION BY rc.category_canonical
      ORDER BY ABS(rc.value_score_canonical) DESC NULLS LAST
    ) AS rn
  FROM afl.player_rankings_cache rc
  WHERE rc.status NOT IN ('injured', 'delisted')
    AND rc.projection_final > 0
    AND rc.price > 0
    AND rc.category_canonical IS NOT NULL
)
SELECT * FROM ranked WHERE rn <= 2
ORDER BY
  CASE category_canonical WHEN 'Target' THEN 1 WHEN 'Watch' THEN 2 ELSE 3 END,
  ABS(value_score_canonical) DESC NULLS LAST;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;

-- ============================================================
-- market.v_mw_summary — category counts
-- ============================================================
CREATE VIEW market.v_mw_summary AS
SELECT
  COUNT(*) FILTER (WHERE rc.category_canonical = 'Target') AS target_count,
  COUNT(*) FILTER (WHERE rc.category_canonical = 'Watch')  AS watch_count,
  COUNT(*) FILTER (WHERE rc.category_canonical = 'Avoid')  AS avoid_count,
  COUNT(*)                                                  AS total_count,
  MAX(rc.cached_at)                                         AS last_updated
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('injured', 'delisted')
  AND rc.projection_final > 0
  AND rc.price > 0;

GRANT SELECT ON market.v_mw_summary TO anon, authenticated;

-- ============================================================
-- market.v_mw_category_counts — alias
-- ============================================================
CREATE VIEW market.v_mw_category_counts AS
SELECT * FROM market.v_mw_summary;

GRANT SELECT ON market.v_mw_category_counts TO anon, authenticated;

-- ============================================================
-- market.v_market_watch_free — public proxy alias
-- ============================================================
CREATE VIEW market.v_market_watch_free AS
SELECT * FROM market.v_mw_free;

GRANT SELECT ON market.v_market_watch_free TO anon, authenticated;

-- ============================================================
-- public.v_mw_summary — public wrapper
-- ============================================================
CREATE VIEW public.v_mw_summary AS
SELECT * FROM market.v_mw_summary;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;

-- ============================================================
-- public.v_mw_summary_cards — backward compat alias
-- ============================================================
CREATE VIEW public.v_mw_summary_cards AS
SELECT * FROM market.v_mw_summary;

GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;

-- ============================================================
-- public.v_mw_status — simple health check view
-- ============================================================
CREATE VIEW public.v_mw_status AS
SELECT
  COUNT(*)                                                     AS total_players,
  COUNT(*) FILTER (WHERE category_canonical = 'Target')        AS targets,
  COUNT(*) FILTER (WHERE category_canonical = 'Watch')         AS watches,
  COUNT(*) FILTER (WHERE category_canonical = 'Avoid')         AS avoids,
  MAX(cached_at)                                               AS last_updated,
  NOW()                                                        AS checked_at
FROM afl.player_rankings_cache
WHERE status NOT IN ('injured', 'delisted')
  AND projection_final > 0
  AND price > 0;

GRANT SELECT ON public.v_mw_status TO anon, authenticated;

-- ============================================================
-- public.v_mw_category_counts — public wrapper
-- ============================================================
CREATE VIEW public.v_mw_category_counts AS
SELECT * FROM market.v_mw_summary;

GRANT SELECT ON public.v_mw_category_counts TO anon, authenticated;

-- ============================================================
-- public.v_market_watch_signals — backward compat
-- ============================================================
CREATE VIEW public.v_market_watch_signals AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team_name                                                 AS team,
  rc.position,
  rc.price,
  rc.signal_canonical                                          AS signal,
  rc.category_canonical                                        AS category,
  rc.action_canonical                                          AS action,
  rc.edge_canonical                                            AS edge,
  rc.value_score_canonical                                     AS value_score,
  rc.cached_at
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('injured', 'delisted')
  AND rc.projection_final > 0
  AND rc.price > 0;

GRANT SELECT ON public.v_market_watch_signals TO anon, authenticated;

-- ============================================================
-- public.v_mw_best_trades — top trade targets / sells
-- ============================================================
CREATE VIEW public.v_mw_best_trades AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team_name                                                 AS team,
  rc.position,
  rc.price,
  rc.projection_final,
  rc.edge_canonical                                            AS edge,
  rc.value_score_canonical                                     AS value_score,
  rc.signal_canonical                                          AS signal,
  rc.category_canonical                                        AS category,
  rc.action_canonical                                          AS action,
  rc.summary_short
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('injured', 'delisted')
  AND rc.projection_final > 0
  AND rc.price > 0
  AND rc.category_canonical IN ('Target', 'Avoid')
ORDER BY ABS(rc.value_score_canonical) DESC NULLS LAST
LIMIT 20;

GRANT SELECT ON public.v_mw_best_trades TO anon, authenticated;

-- ============================================================
-- public.v_mw_diagnostics — debug view
-- ============================================================
CREATE VIEW public.v_mw_diagnostics AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team_name                                                 AS team,
  rc.projection_final,
  rc.breakeven_canonical,
  rc.edge_canonical,
  rc.value_score_canonical,
  rc.signal_canonical,
  rc.category_canonical,
  rc.action_canonical,
  rc.market_watch_category,
  CASE WHEN rc.category_canonical != rc.market_watch_category THEN 'MISMATCH' ELSE 'OK' END AS consistency_check,
  rc.cached_at
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('injured', 'delisted')
  AND rc.projection_final > 0
  AND rc.price > 0;

GRANT SELECT ON public.v_mw_diagnostics TO anon, authenticated;
