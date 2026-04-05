
/*
  # Fix Edge Board Signal Vocabulary + Unify All Surfaces

  ## Summary
  All four surfaces (Rankings, Market Watch, Edge Board, Landing Page) must derive signals
  from the same source: afl.player_rankings_cache.signal (STRONG_UP/UP/STABLE/DOWN/STRONG_DOWN).

  ## Problems Fixed

  1. **public.v_edge_board_safe** — was filtering on STRONG_BUY/BUY/STRONG_SELL/SELL which
     don't exist in the cache → 0 rows returned for captain/breakout/trap sections.
     Fixed to use STRONG_UP/UP (positive) and STRONG_DOWN/DOWN (negative).

  2. **public.get_edge_board_data RPC** — was filtering value_signal IN ('BUY','STRONG_BUY')
     and trend_signal = 'STRONG_UP' on columns that don't carry those values.
     Fixed to use signal IN ('STRONG_UP','UP') for must_have, signal = 'STRONG_UP' for
     breakout, signal IN ('DOWN','STRONG_DOWN') for do_not_start.

  3. **public.populate_mv_edge_board** — captain/breakout/trap logic used upside_rating and
     ceiling_gap heuristics that bypassed signal entirely. Fixed to use signal as primary
     filter aligned with Rankings.

  4. **public.v_market_watch_signals** — was reading from afl.v_price_changes with a
     completely different signal vocabulary (CASH_COW/BUY_BEFORE_RISE/SELL_BEFORE_DROP/
     FADE_TRAP). Rewritten to source directly from afl.player_rankings_cache.

  5. **public.v_mw_summary** — was reading from stale market.market_watch_snapshot_players
     with old category names. Rewritten to read from market.v_mw_premium.

  6. **public.v_mw_category_counts** — same stale source, wrong names (buy/sell_now/cash_cow).
     Rewritten to read from market.v_mw_premium with canonical Target/Watch/Avoid names.

  7. **Sync market_watch_category on player_rankings_cache** — column was stale (214 Avoid,
     4 Target) because it was populated by old snapshot logic. Updated inline to derive
     from signal column.

  ## Canonical Signal Vocabulary
  - STRONG_UP / UP → Target (positive value, buy signal)
  - STABLE          → Watch (hold signal)
  - DOWN / STRONG_DOWN → Avoid (negative value, sell signal)
*/

-- ============================================================
-- 1. FIX public.v_edge_board_safe
--    Replace STRONG_BUY/BUY/STRONG_SELL/SELL with correct vocab
-- ============================================================
DROP VIEW IF EXISTS public.v_edge_board_safe CASCADE;

CREATE OR REPLACE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
WITH ranked AS (
  SELECT
    e.player_id,
    e.player_name,
    e.team,
    e."position",
    e.price,
    e.projection_final,
    e.breakeven,
    e.edge,
    e.value_score,
    e.neeko_rating,
    e.consistency,
    e.games_played,
    e.signal,
    e.summary_short,
    e.recommendation_short,
    e.recommendation_color,
    e.is_injured,
    e.cached_at,
    e.is_valid_edge_candidate
  FROM afl.v_edge_board_core e
  WHERE e.is_valid_edge_candidate = true
    AND e.is_injured = false
),
captain AS (
  SELECT r.*, 'captain'::text AS signal_type
  FROM ranked r
  WHERE r.signal IN ('STRONG_UP', 'UP')
    AND r.projection_final >= 60
  ORDER BY r.edge DESC
  LIMIT 1
),
breakout AS (
  SELECT r.*, 'breakout'::text AS signal_type
  FROM ranked r
  WHERE r.signal = 'STRONG_UP'
    AND r.value_score >= 3
    AND r.player_id NOT IN (SELECT player_id FROM captain)
  ORDER BY r.value_score DESC
  LIMIT 1
),
trap AS (
  SELECT r.*, 'trap'::text AS signal_type
  FROM ranked r
  WHERE r.signal IN ('STRONG_DOWN', 'DOWN')
    AND r.price >= 300000
    AND r.player_id NOT IN (SELECT player_id FROM captain)
    AND r.player_id NOT IN (SELECT player_id FROM breakout)
  ORDER BY r.edge ASC
  LIMIT 1
)
SELECT * FROM captain
UNION ALL SELECT * FROM breakout
UNION ALL SELECT * FROM trap;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;

-- ============================================================
-- 2. FIX public.get_edge_board_data RPC
--    Replace value_signal IN ('BUY','STRONG_BUY') with signal vocab
-- ============================================================
DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 5)
RETURNS TABLE(
  player_id            integer,
  player_name          text,
  team                 text,
  player_position      text,
  section              text,
  section_rank         bigint,
  projection_final     numeric,
  ceiling_estimate     double precision,
  floor_estimate       double precision,
  upside_rating        double precision,
  risk_rating          double precision,
  projection_confidence double precision,
  captain_score        double precision,
  captain_rating       text,
  neeko_rating         double precision,
  price                integer,
  price_change         integer,
  value_score          double precision,
  value_tag            text,
  ai_summary           text,
  recommendation_color text,
  refreshed_at         timestamp with time zone,
  edge                 numeric,
  signal_tag           text,
  signal               text,
  summary_short        text,
  trend_signal         text,
  breakeven            numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
WITH base AS (
  SELECT
    c.player_id,
    c.player_name,
    COALESCE(c.team_name, c.team)   AS team,
    c."position"                    AS player_position,
    c.projection_final,
    c.ceiling_estimate,
    c.floor_estimate,
    c.upside_rating,
    c.risk_rating,
    c.projection_confidence,
    c.captain_score,
    c.captain_rating,
    c.neeko_rating,
    c.price,
    c.price_change,
    c.value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color,
    c.cached_at                     AS refreshed_at,
    c.edge,
    c.breakeven,
    c.signal,
    c.signal_tag,
    c.summary_short,
    c.signal                        AS trend_signal
  FROM afl.player_rankings_cache c
  WHERE c.games_played >= 3
    AND c.projection_final > 40
    AND COALESCE(c.manual_status, c.status, '') NOT IN ('injured', 'inactive', 'inactive_ghost', 'OUT', 'INJURED', 'OMITTED')
    AND COALESCE(c.is_bye, false) = false
    AND COALESCE(c.is_available, true) = true
    AND c.price > 0
),

-- Section 1: MUST HAVE — players with STRONG_UP or UP signal, best value first
must_have_candidates AS (
  SELECT
    b.*,
    'must_have'::text AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.value_score, -99) DESC, COALESCE(b.projection_final, 0) DESC) AS section_rank
  FROM base b
  WHERE b.signal IN ('STRONG_UP', 'UP')
  LIMIT limit_n
),

-- Section 2: BREAKOUT — STRONG_UP signal specifically, not already in must_have
breakout_candidates AS (
  SELECT
    b.*,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.projection_final, 0) DESC, COALESCE(b.value_score, -99) DESC) AS section_rank
  FROM base b
  WHERE b.signal = 'STRONG_UP'
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
  LIMIT limit_n
),

-- Section 3: DO NOT START — DOWN or STRONG_DOWN signal
do_not_start_candidates AS (
  SELECT
    b.*,
    'do_not_start'::text AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.risk_rating, 0) DESC, COALESCE(b.projection_final, 999) ASC) AS section_rank
  FROM base b
  WHERE b.signal IN ('DOWN', 'STRONG_DOWN')
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
    AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
  LIMIT limit_n
),

combined AS (
  SELECT * FROM must_have_candidates
  UNION ALL SELECT * FROM breakout_candidates
  UNION ALL SELECT * FROM do_not_start_candidates
)

SELECT
  player_id,
  player_name,
  team,
  player_position,
  section,
  section_rank,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  upside_rating,
  risk_rating,
  projection_confidence,
  captain_score,
  captain_rating,
  neeko_rating,
  price,
  price_change,
  value_score,
  value_tag,
  ai_summary,
  recommendation_color,
  refreshed_at,
  edge,
  signal_tag,
  signal,
  summary_short,
  trend_signal,
  breakeven
FROM combined
ORDER BY section, section_rank;
$function$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon, authenticated;

-- ============================================================
-- 3. FIX public.populate_mv_edge_board
--    Wire captain/breakout/trap to signal column
-- ============================================================
CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_inserted int := 0;
BEGIN

WITH eligible AS (
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.position,
    c.projection_final,
    c.ceiling_estimate,
    c.floor_estimate,
    c.upside_rating,
    c.risk_rating,
    c.projection_confidence,
    c.captain_score,
    c.captain_rating,
    c.neeko_rating,
    c.price,
    c.price_change,
    c.price_change_pct,
    c.value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color,
    c.consistency,
    c.signal
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
    AND COALESCE(c.projection_final, 0) > 0
    AND COALESCE(c.is_available, true) = true
    AND COALESCE(c.status, 'AVAILABLE') <> 'OUT'
    AND COALESCE(c.is_bye, false) = false
    AND c.player_name IS NOT NULL
    AND c.games_played >= 3
    AND c.price > 0
),
-- Captain: STRONG_UP or UP signal, highest captain_score
captain_ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY COALESCE(captain_score, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal IN ('STRONG_UP', 'UP')
    AND captain_score IS NOT NULL
    AND projection_final >= 60
),
top_captains AS (
  SELECT *, rn AS section_rank FROM captain_ranked WHERE rn <= 10
),
-- Breakout: STRONG_UP signal specifically, not already captain
breakout_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY COALESCE(value_score, -99) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal = 'STRONG_UP'
    AND projection_final >= 50
    AND player_id NOT IN (SELECT player_id FROM top_captains)
),
top_breakouts AS (
  SELECT *, rn AS section_rank FROM breakout_ranked WHERE rn <= 10
),
-- Trap: DOWN or STRONG_DOWN signal, highest price (premium risks)
trap_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY COALESCE(risk_rating, 0) DESC NULLS LAST, COALESCE(price, 0) DESC NULLS LAST) AS rn
  FROM eligible
  WHERE signal IN ('DOWN', 'STRONG_DOWN')
    AND price >= 250000
    AND player_id NOT IN (SELECT player_id FROM top_captains)
    AND player_id NOT IN (SELECT player_id FROM top_breakouts)
),
top_traps AS (
  SELECT *, rn AS section_rank FROM trap_ranked WHERE rn <= 10
),
all_sections AS (
  SELECT 'captain'::text AS section, section_rank, player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now() AS refreshed_at
  FROM top_captains
  UNION ALL
  SELECT 'breakout'::text, section_rank, player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now()
  FROM top_breakouts
  UNION ALL
  SELECT 'trap'::text, section_rank, player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
    projection_confidence, captain_score, captain_rating, neeko_rating,
    price, price_change, price_change_pct, value_score, value_tag,
    ai_summary, recommendation_color, now()
  FROM top_traps
)
INSERT INTO public.mv_edge_board (
  section, section_rank, player_id, player_name, team, position,
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct, value_score, value_tag,
  ai_summary, recommendation_color, refreshed_at
)
SELECT
  section, section_rank, player_id, player_name, team, position,
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating,
  price, price_change, price_change_pct, value_score, value_tag,
  ai_summary, recommendation_color, refreshed_at
FROM all_sections
ON CONFLICT (section, section_rank) DO UPDATE SET
  player_id              = EXCLUDED.player_id,
  player_name            = EXCLUDED.player_name,
  team                   = EXCLUDED.team,
  position               = EXCLUDED.position,
  projection_final       = EXCLUDED.projection_final,
  ceiling_estimate       = EXCLUDED.ceiling_estimate,
  floor_estimate         = EXCLUDED.floor_estimate,
  upside_rating          = EXCLUDED.upside_rating,
  risk_rating            = EXCLUDED.risk_rating,
  projection_confidence  = EXCLUDED.projection_confidence,
  captain_score          = EXCLUDED.captain_score,
  captain_rating         = EXCLUDED.captain_rating,
  neeko_rating           = EXCLUDED.neeko_rating,
  price                  = EXCLUDED.price,
  price_change           = EXCLUDED.price_change,
  price_change_pct       = EXCLUDED.price_change_pct,
  value_score            = EXCLUDED.value_score,
  value_tag              = EXCLUDED.value_tag,
  ai_summary             = EXCLUDED.ai_summary,
  recommendation_color   = EXCLUDED.recommendation_color,
  refreshed_at           = EXCLUDED.refreshed_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'info',
  'populate_mv_edge_board',
  'edge_board_refreshed',
  'Edge board rebuilt from player_rankings_cache (signal-aligned): ' || v_inserted || ' rows upserted',
  jsonb_build_object('rows_upserted', v_inserted, 'refreshed_at', now()),
  now()
);

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
  VALUES (
    'error',
    'populate_mv_edge_board',
    'edge_board_refresh_error',
    'Edge board refresh failed: ' || SQLERRM,
    jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE),
    now()
  );
  RAISE;
END;
$function$;

-- ============================================================
-- 4. FIX public.v_market_watch_signals
--    Was reading from afl.v_price_changes with CASH_COW/BUY_BEFORE_RISE vocab.
--    Rewrite to source from afl.player_rankings_cache.
-- ============================================================
DROP VIEW IF EXISTS public.v_market_watch_signals CASCADE;

CREATE OR REPLACE VIEW public.v_market_watch_signals
WITH (security_invoker = false)
AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team,
  rc."position"                       AS player_position,
  rc.price                            AS current_price,
  rc.prev_price                       AS previous_price,
  rc.price_change,
  rc.signal,
  CASE
    WHEN rc.signal IN ('STRONG_UP', 'UP')    THEN 'Target'
    WHEN rc.signal IN ('STRONG_DOWN', 'DOWN') THEN 'Avoid'
    ELSE 'Watch'
  END                                 AS category,
  CASE
    WHEN rc.signal IN ('STRONG_UP', 'UP')    THEN 'buy'
    WHEN rc.signal IN ('STRONG_DOWN', 'DOWN') THEN 'sell'
    ELSE 'hold'
  END                                 AS signal_type,
  rc.projection_final                 AS projection,
  rc.breakeven,
  rc.value_score,
  rc.neeko_rating,
  rc.recommendation_short,
  rc.summary_short
FROM afl.player_rankings_cache rc
WHERE rc.is_available = true
  AND rc.price > 0
  AND rc.projection_final > 0
  AND rc.signal IS NOT NULL
  AND COALESCE(rc.games_played, 0) >= 3
  AND COALESCE(rc.is_bye, false) = false
ORDER BY
  CASE rc.signal
    WHEN 'STRONG_UP'   THEN 1
    WHEN 'UP'          THEN 2
    WHEN 'STABLE'      THEN 3
    WHEN 'DOWN'        THEN 4
    WHEN 'STRONG_DOWN' THEN 5
    ELSE 6
  END,
  rc.value_score DESC NULLS LAST;

GRANT SELECT ON public.v_market_watch_signals TO anon, authenticated;

-- ============================================================
-- 5. FIX public.v_mw_summary
--    Was reading from stale market.market_watch_snapshot_players.
--    Rewrite to read from market.v_mw_premium.
-- ============================================================
DROP VIEW IF EXISTS public.v_mw_summary CASCADE;

CREATE OR REPLACE VIEW public.v_mw_summary
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE category = 'Target') AS target_count,
  count(*) FILTER (WHERE category = 'Watch')  AS watch_count,
  count(*) FILTER (WHERE category = 'Avoid')  AS avoid_count,
  count(*)                                     AS total_count,
  now()                                        AS last_updated
FROM market.v_mw_premium;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;

-- ============================================================
-- 6. FIX public.v_mw_category_counts
--    Was reading old snapshot table with buy/sell_now/cash_cow names.
--    Rewrite to use market.v_mw_premium with canonical names.
-- ============================================================
DROP VIEW IF EXISTS public.v_mw_category_counts CASCADE;

CREATE OR REPLACE VIEW public.v_mw_category_counts
WITH (security_invoker = false)
AS
SELECT
  count(*) FILTER (WHERE category = 'Target') AS target_count,
  count(*) FILTER (WHERE category = 'Watch')  AS watch_count,
  count(*) FILTER (WHERE category = 'Avoid')  AS avoid_count,
  count(*)                                     AS total_count,
  now()                                        AS last_updated
FROM market.v_mw_premium;

GRANT SELECT ON public.v_mw_category_counts TO anon, authenticated;

-- ============================================================
-- 7. SYNC market_watch_category on player_rankings_cache
--    Derive from signal column — was stale (214 Avoid, 4 Target)
-- ============================================================
UPDATE afl.player_rankings_cache
SET market_watch_category = CASE
  WHEN signal IN ('STRONG_UP', 'UP')    THEN 'Target'
  WHEN signal IN ('STRONG_DOWN', 'DOWN') THEN 'Avoid'
  ELSE 'Watch'
END
WHERE signal IS NOT NULL;

-- Log the sync
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
VALUES (
  'info',
  'migration',
  'market_watch_category_synced',
  'Synced market_watch_category from signal column on player_rankings_cache',
  jsonb_build_object('synced_at', now()),
  now()
);
