/*
  # Rebuild Edge Board from Simplified Rankings Cache

  ## Summary
  Rebuilds afl.v_edge_board_core and public.v_edge_board_safe using the new
  simplified cache columns (edge_score, value_score, projection_final, breakeven)
  instead of legacy captain_score, upside_rating, risk_rating columns.

  ## Changes
  - afl.v_edge_board_core: rewritten to use edge_score and value_score
  - public.v_edge_board_safe: rebuilt — 3 sections:
      Captain pick  = highest edge_score (projection >> breakeven)
      Breakout pick = best value_score (most underpriced vs market)
      Trap pick     = worst edge (negative edge, overpriced)
  - get_edge_board_data RPC: rebuilt to match new view columns

  ## Logic
  - Captain: games_played >= 3, projection_final > 60, ai_recommendation IN (STRONG_BUY, BUY), highest edge_score
  - Breakout: games_played >= 3, value_score > 5, highest value_score (market underpriced)
  - Trap: games_played >= 3, ai_recommendation IN (STRONG_SELL, SELL), lowest edge_score (most negative)

  ## Security
  - Views use security_invoker = false for consistent access
  - GRANT SELECT to anon and authenticated
*/

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Rebuild afl.v_edge_board_core
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS afl.v_edge_board_core CASCADE;

CREATE VIEW afl.v_edge_board_core
WITH (security_invoker = false)
AS
SELECT
  rc.player_id,
  rc.player_name,
  rc.team,
  rc.team_name,
  rc.position,
  rc.price,
  rc.prev_price,
  rc.price_change,
  rc.projection_final,
  rc.breakeven,
  rc.edge_score,
  rc.value_score,
  rc.neeko_rating,
  rc.consistency,
  rc.projection_confidence,
  rc.games_played,
  rc.ai_recommendation,
  rc.market_watch_category,
  rc.summary_short,
  rc.recommendation_short,
  rc.recommendation_color,
  rc.matchup_label,
  rc.ceiling,
  rc.floor,
  rc.form_score,
  rc.status,
  rc.manual_status,
  rc.is_available,
  rc.is_bye,
  (rc.status = 'injured' OR rc.manual_status = 'injured') AS is_injured,
  rc.cached_at,
  CASE
    WHEN rc.edge_score >= 15 THEN 'STRONG_BUY'
    WHEN rc.edge_score >= 6  THEN 'BUY'
    WHEN rc.edge_score <= -15 THEN 'STRONG_SELL'
    WHEN rc.edge_score <= -6  THEN 'SELL'
    ELSE 'HOLD'
  END AS edge_tier,
  (
    rc.price IS NOT NULL
    AND rc.price > 0
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final::double precision > 30
    AND rc.games_played >= 3
    AND rc.player_name IS NOT NULL
    AND rc.team IS NOT NULL
    AND rc.team != ''
    AND COALESCE(rc.is_available, true) = true
    AND COALESCE(rc.status, 'AVAILABLE') NOT IN ('OUT', 'INJURED')
    AND COALESCE(rc.manual_status, 'AVAILABLE') NOT IN ('OUT', 'INJURED', 'INACTIVE', 'injured', 'bye')
    AND rc.is_bye IS NOT TRUE
  ) AS is_valid_edge_candidate
FROM afl.player_rankings_cache rc
WHERE
  rc.player_id IS NOT NULL
  AND rc.player_name IS NOT NULL
  AND rc.projection_final IS NOT NULL
  AND rc.projection_final::double precision > 30
  AND COALESCE(rc.is_available, true) = true
  AND COALESCE(rc.status, 'AVAILABLE') NOT IN ('OUT', 'INJURED')
  AND COALESCE(rc.manual_status, 'AVAILABLE') NOT IN ('OUT', 'INJURED', 'INACTIVE', 'injured', 'bye')
  AND rc.is_bye IS NOT TRUE;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Rebuild public.v_edge_board_safe
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_edge_board_safe CASCADE;

CREATE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
WITH valid_pool AS (
  SELECT * FROM afl.v_edge_board_core
  WHERE is_valid_edge_candidate = true
),
captain AS (
  SELECT
    player_id, player_name, team, position,
    projection_final, breakeven, edge_score, value_score,
    neeko_rating, consistency, projection_confidence,
    recommendation_short, recommendation_color, summary_short,
    cached_at,
    'captain'::text AS signal_type
  FROM valid_pool
  WHERE ai_recommendation IN ('STRONG_BUY', 'BUY')
    AND projection_final::double precision >= 60
    AND games_played >= 3
  ORDER BY edge_score DESC NULLS LAST, projection_final DESC NULLS LAST
  LIMIT 1
),
remaining_after_captain AS (
  SELECT * FROM valid_pool
  WHERE player_id NOT IN (SELECT player_id FROM captain)
),
breakout AS (
  SELECT
    r.player_id, r.player_name, r.team, r.position,
    r.projection_final, r.breakeven, r.edge_score, r.value_score,
    r.neeko_rating, r.consistency, r.projection_confidence,
    r.recommendation_short, r.recommendation_color, r.summary_short,
    r.cached_at,
    'breakout'::text AS signal_type
  FROM remaining_after_captain r
  WHERE r.value_score >= 5
    AND r.games_played >= 3
  ORDER BY r.value_score DESC NULLS LAST, r.projection_final DESC NULLS LAST
  LIMIT 1
),
remaining_after_breakout AS (
  SELECT * FROM remaining_after_captain
  WHERE player_id NOT IN (SELECT player_id FROM breakout)
),
trap AS (
  SELECT
    r.player_id, r.player_name, r.team, r.position,
    r.projection_final, r.breakeven, r.edge_score, r.value_score,
    r.neeko_rating, r.consistency, r.projection_confidence,
    r.recommendation_short, r.recommendation_color, r.summary_short,
    r.cached_at,
    'trap'::text AS signal_type
  FROM remaining_after_breakout r
  WHERE r.ai_recommendation IN ('STRONG_SELL', 'SELL')
    AND r.games_played >= 3
    AND r.price >= 300000
  ORDER BY r.edge_score ASC NULLS LAST, r.value_score ASC NULLS LAST
  LIMIT 1
)
SELECT * FROM captain
UNION ALL
SELECT * FROM breakout
UNION ALL
SELECT * FROM trap;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Rebuild get_edge_board_data RPC
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_edge_board_data();

CREATE OR REPLACE FUNCTION public.get_edge_board_data()
RETURNS TABLE (
  player_name           text,
  team                  text,
  player_position       text,
  projection_final      double precision,
  breakeven             numeric,
  edge_score            numeric,
  value_score           double precision,
  neeko_rating          double precision,
  consistency           double precision,
  projection_confidence double precision,
  recommendation_short  text,
  recommendation_color  text,
  summary_short         text,
  signal_type           text,
  cached_at             timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT
    player_name,
    team,
    position            AS player_position,
    projection_final,
    breakeven,
    edge_score,
    value_score,
    neeko_rating,
    consistency,
    projection_confidence,
    recommendation_short,
    recommendation_color,
    summary_short,
    signal_type,
    cached_at
  FROM public.v_edge_board_safe
  ORDER BY
    CASE signal_type WHEN 'captain' THEN 1 WHEN 'breakout' THEN 2 WHEN 'trap' THEN 3 ELSE 4 END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Grants
-- ────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON afl.v_edge_board_core TO authenticated, anon;
GRANT SELECT ON public.v_edge_board_safe TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data() TO authenticated, anon;
