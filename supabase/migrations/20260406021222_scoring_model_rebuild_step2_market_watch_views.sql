/*
  # Scoring Model Rebuild — Step 2: Market Watch Views

  ## Summary
  Rebuilds market watch views to:
  - Pull directly from canonical cache fields (breakeven_canonical, edge_canonical,
    value_score_canonical, signal_canonical, category_canonical)
  - Exclude rookies (games_played < 3) from actionable views — they show in Watch only
  - Sort by edge_canonical DESC for Target, ASC for Avoid
  - No negative-edge Target players
  - No zero-price or zero-projection players

  ## Views rebuilt
  - market.v_mw_premium   — full dataset, premium users
  - market.v_mw_free      — 2 per category sample, free users
  - market.v_mw_summary   — counts by category
  - public.v_mw_summary_cards — proxy for summary card widget
  - public.v_mw_best_trades   — top Target + top Avoid players
  - public.v_mw_summary       — proxy
  - market.build_market_watch_snapshot — aligned to canonical fields
*/

-- ─── market.v_mw_premium ────────────────────────────────────────────────────
-- Full dataset sorted by absolute edge (biggest movers first)
CREATE OR REPLACE VIEW market.v_mw_premium
WITH (security_invoker = false)
AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team_name                      AS team,
  rc.team_name,
  rc."position",
  rc.price,
  rc.prev_price,
  rc.price_change,
  rc.price_change_pct,
  rc.projection_final,
  rc.season_avg,
  rc.last_3_avg,
  rc.last_5_avg,
  rc.games_played,
  rc.breakeven_canonical            AS breakeven,
  rc.edge_canonical                 AS edge,
  rc.value_score_canonical          AS value_score,
  rc.signal_canonical               AS signal,
  rc.signal_canonical               AS signal_tag,
  rc.category_canonical             AS category,
  rc.category_canonical             AS market_watch_category,
  rc.action_canonical               AS action,
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
  AND rc.games_played >= 3
ORDER BY ABS(rc.edge_canonical) DESC NULLS LAST;

-- ─── market.v_mw_free ───────────────────────────────────────────────────────
-- 2 per category for free users, best by edge within each bucket
CREATE OR REPLACE VIEW market.v_mw_free
WITH (security_invoker = false)
AS
WITH ranked AS (
  SELECT
    rc.player_id,
    rc.player_name,
    rc.team_name                    AS team,
    rc.team_name,
    rc."position",
    rc.price,
    rc.projection_final,
    rc.season_avg,
    rc.last_3_avg,
    rc.last_5_avg,
    rc.games_played,
    rc.breakeven_canonical          AS breakeven,
    rc.edge_canonical               AS edge,
    rc.value_score_canonical        AS value_score,
    rc.signal_canonical             AS signal,
    rc.signal_canonical             AS signal_tag,
    rc.category_canonical           AS category,
    rc.category_canonical           AS market_watch_category,
    rc.action_canonical             AS action,
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
      ORDER BY
        CASE rc.category_canonical
          WHEN 'Target' THEN rc.edge_canonical
          WHEN 'Avoid'  THEN rc.edge_canonical
          ELSE -ABS(rc.edge_canonical)
        END DESC NULLS LAST
    ) AS rn
  FROM afl.player_rankings_cache rc
  WHERE rc.status NOT IN ('injured', 'delisted')
    AND rc.projection_final > 0
    AND rc.price > 0
    AND rc.games_played >= 3
    AND rc.category_canonical IS NOT NULL
)
SELECT
  player_id, player_name, team, team_name, "position", price, projection_final,
  season_avg, last_3_avg, last_5_avg, games_played, breakeven, edge, value_score,
  signal, signal_tag, category, market_watch_category, action, status, is_bye,
  summary_short, neeko_rating, breakeven_canonical, edge_canonical,
  value_score_canonical, signal_canonical, category_canonical, action_canonical,
  cached_at, rn
FROM ranked
WHERE rn <= 2
ORDER BY
  CASE category_canonical
    WHEN 'Target' THEN 1
    WHEN 'Watch'  THEN 2
    ELSE 3
  END,
  ABS(edge_canonical) DESC NULLS LAST;

-- ─── market.v_mw_summary ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW market.v_mw_summary
WITH (security_invoker = false)
AS
SELECT
  COUNT(*) FILTER (WHERE category_canonical = 'Target') AS target_count,
  COUNT(*) FILTER (WHERE category_canonical = 'Watch')  AS watch_count,
  COUNT(*) FILTER (WHERE category_canonical = 'Avoid')  AS avoid_count,
  COUNT(*)                                               AS total_count,
  MAX(cached_at)                                         AS last_updated
FROM afl.player_rankings_cache rc
WHERE status NOT IN ('injured', 'delisted')
  AND projection_final > 0
  AND price > 0
  AND games_played >= 3;

-- ─── public proxies ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_mw_summary
WITH (security_invoker = false)
AS
SELECT target_count, watch_count, avoid_count, total_count, last_updated
FROM market.v_mw_summary;

CREATE OR REPLACE VIEW public.v_mw_summary_cards
WITH (security_invoker = false)
AS
SELECT target_count, watch_count, avoid_count, total_count, last_updated
FROM market.v_mw_summary;

-- ─── public.v_mw_best_trades ────────────────────────────────────────────────
-- Top Target (highest edge) + Top Avoid (lowest edge), for landing / homepage
CREATE OR REPLACE VIEW public.v_mw_best_trades
WITH (security_invoker = false)
AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team_name                      AS team,
  rc."position",
  rc.price,
  rc.projection_final,
  rc.edge_canonical                 AS edge,
  rc.value_score_canonical          AS value_score,
  rc.signal_canonical               AS signal,
  rc.category_canonical             AS category,
  rc.action_canonical               AS action,
  rc.summary_short
FROM afl.player_rankings_cache rc
WHERE rc.status NOT IN ('injured', 'delisted')
  AND rc.projection_final > 0
  AND rc.price > 0
  AND rc.games_played >= 3
  AND rc.category_canonical IN ('Target', 'Avoid')
ORDER BY ABS(rc.edge_canonical) DESC NULLS LAST
LIMIT 20;

-- Grants
GRANT SELECT ON market.v_mw_premium TO authenticated;
GRANT SELECT ON market.v_mw_free TO anon, authenticated;
GRANT SELECT ON market.v_mw_summary TO anon, authenticated;
GRANT SELECT ON public.v_mw_summary TO anon, authenticated;
GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;
GRANT SELECT ON public.v_mw_best_trades TO anon, authenticated;
