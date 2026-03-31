/*
  # Rebuild v_edge_board_safe — Deduplicated & Hardened Signal Selection

  ## Changes
  - Players are selected sequentially so no player can appear in two signals
  - remaining_1 excludes the captain; remaining_2 excludes captain + value pick
  - Every signal has a fallback so exactly 3 rows are always returned
  - Do Not Start now uses risk_rating DESC + projection_confidence ASC + value_score ASC
    which ensures the riskiest relevant player is chosen

  ## Signal order (and dedup chain)
  1. Captain Lock   — full available pool
  2. Must Have Value — pool minus captain
  3. Do Not Start   — pool minus captain and value pick

  ## Fallback chain
  - value_pick empty  → top neeko_rating from remaining_1
  - do_not_start empty → highest risk_rating from remaining_2
*/

DROP VIEW IF EXISTS public.v_edge_board_safe;

CREATE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
WITH available_players AS (
  SELECT
    player_id,
    player_name,
    team,
    position,
    neeko_rating,
    projection_final::double precision        AS projection_final,
    ceiling_estimate,
    floor_estimate,
    projection_confidence,
    risk_rating,
    upside_rating,
    captain_score,
    COALESCE(best_value_score, value_score, 0) AS resolved_value_score,
    COALESCE(value_score, 0)                   AS raw_value_score
  FROM afl.player_rankings_cache
  WHERE
    COALESCE(is_available, true) = true
    AND COALESCE(status, 'AVAILABLE') != 'OUT'
    AND projection_final IS NOT NULL
    AND COALESCE(projection_final, 0) > 0
),

-- ── Signal 1: Captain Lock ───────────────────────────────────────────────────
captain AS (
  SELECT *
  FROM available_players
  ORDER BY COALESCE(captain_score, 0) DESC, projection_final DESC NULLS LAST
  LIMIT 1
),

-- ── Remaining pool after captain is excluded ─────────────────────────────────
remaining_1 AS (
  SELECT *
  FROM available_players
  WHERE player_id NOT IN (SELECT player_id FROM captain)
),

-- ── Signal 2: Must Have Value (primary) ──────────────────────────────────────
value_pick_primary AS (
  SELECT *
  FROM remaining_1
  WHERE resolved_value_score > 0
  ORDER BY resolved_value_score DESC, projection_final DESC NULLS LAST
  LIMIT 1
),

-- ── Signal 2: Must Have Value (fallback = top neeko_rating) ──────────────────
value_pick_fallback AS (
  SELECT *
  FROM remaining_1
  ORDER BY COALESCE(neeko_rating, 0) DESC
  LIMIT 1
),

-- ── Resolved value pick: prefer primary, else fallback ────────────────────────
value_pick AS (
  SELECT * FROM value_pick_primary
  UNION ALL
  SELECT * FROM value_pick_fallback
  LIMIT 1
),

-- ── Remaining pool after captain + value pick are excluded ───────────────────
remaining_2 AS (
  SELECT *
  FROM remaining_1
  WHERE player_id NOT IN (SELECT player_id FROM value_pick)
),

-- ── Signal 3: Do Not Start (primary) ─────────────────────────────────────────
do_not_start_primary AS (
  SELECT *
  FROM remaining_2
  ORDER BY
    COALESCE(risk_rating, 0) DESC,
    COALESCE(projection_confidence, 100) ASC,
    raw_value_score ASC
  LIMIT 1
),

-- ── Signal 3: Do Not Start (fallback = highest risk from full remaining_2) ────
do_not_start_fallback AS (
  SELECT *
  FROM remaining_2
  ORDER BY COALESCE(risk_rating, 0) DESC
  LIMIT 1
),

-- ── Resolved do not start ────────────────────────────────────────────────────
do_not_start AS (
  SELECT * FROM do_not_start_primary
  UNION ALL
  SELECT * FROM do_not_start_fallback
  LIMIT 1
)

-- ── Final output: exactly 3 unique rows ──────────────────────────────────────
SELECT
  player_name, team, position, neeko_rating, projection_final,
  ceiling_estimate, projection_confidence, risk_rating, upside_rating,
  'captain'  AS signal_type
FROM captain

UNION ALL

SELECT
  player_name, team, position, neeko_rating, projection_final,
  ceiling_estimate, projection_confidence, risk_rating, upside_rating,
  'breakout' AS signal_type
FROM value_pick

UNION ALL

SELECT
  player_name, team, position, neeko_rating, projection_final,
  ceiling_estimate, projection_confidence, risk_rating, upside_rating,
  'trap'     AS signal_type
FROM do_not_start;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
