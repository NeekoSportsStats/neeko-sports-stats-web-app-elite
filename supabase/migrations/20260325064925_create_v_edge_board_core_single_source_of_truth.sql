/*
  # Create afl.v_edge_board_core — Single Source of Truth for Edge Board Signals

  ## Summary
  Replaces the split logic between `v_edge_board_safe` (landing page) and
  `get_edge_board_data` RPC (edge board page) with a single unified view that
  both pages query from.

  ## Why This Was Needed
  - `v_edge_board_safe` had minimal filters — allowing players with 0 games,
    0 value_score, and retired players (e.g. Mitchell Duncan: games=0, value=0)
    to surface.
  - `get_edge_board_data` RPC pulled from `public.v_rankings_canonical` with
    different logic, causing inconsistency between the two pages.
  - No shared minimum eligibility gate existed between them.

  ## New View: afl.v_edge_board_core
  Single clean base dataset used by both pages.

  ### Strict Eligibility Filters Applied:
  1. price > 0 AND price IS NOT NULL
  2. projection_final > 20
  3. games_played >= 3 (removes rookies and retired players with 0 games)
  4. is_available = true (or NULL, treated as available)
  5. manual_status NOT IN ('OUT', 'INJURED') (hard override)
  6. status NOT IN ('OUT', 'INJURED') (pipeline status)
  7. value_score > 0 (removes players with no calculated value)
  8. team IS NOT NULL AND team != '' (removes ghost/retired player entries)
  9. player_name IS NOT NULL

  ### Columns Exposed:
  Full column set needed by landing page (signal_type preview) and edge board
  page (ranked sections). The `is_valid_edge_candidate` boolean is included for
  optional downstream use.

  ## Modified Objects:
  - DROP + recreate `public.v_edge_board_safe` (landing page view)
  - DROP + recreate `public.get_edge_board_data` RPC (edge board page)
  - CREATE `afl.v_edge_board_core` (new shared base)

  ## Security
  - Grants SELECT to anon, authenticated, service_role on the new view
  - RPC uses SECURITY DEFINER with fixed search_path
*/

-- ============================================================
-- Step 1: Drop landing page view (will be rebuilt on new core)
-- ============================================================

DROP VIEW IF EXISTS public.v_edge_board_safe CASCADE;

-- ============================================================
-- Step 2: Create afl.v_edge_board_core — the clean base dataset
-- ============================================================

CREATE OR REPLACE VIEW afl.v_edge_board_core AS
SELECT
  player_id,
  player_name,
  team,
  position,
  price,
  price_change,
  prev_price,
  projection_final::double precision          AS projection_final,
  ceiling_estimate::double precision          AS ceiling_estimate,
  floor_estimate::double precision            AS floor_estimate,
  projection_confidence::double precision     AS projection_confidence,
  captain_score::double precision             AS captain_score,
  captain_rating,
  neeko_rating::double precision              AS neeko_rating,
  neeko_rating_scaled::double precision       AS neeko_rating_scaled,
  risk_rating::double precision               AS risk_rating,
  upside_rating::double precision             AS upside_rating,
  upside_pct::double precision                AS upside_pct,
  value_score::double precision               AS value_score,
  best_value_score::double precision          AS best_value_score,
  value_tag,
  form_score::double precision                AS form_score,
  consistency::double precision               AS consistency,
  games_played,
  is_available,
  status,
  manual_status,
  ai_summary,
  recommendation_short,
  recommendation_color,
  cached_at,
  (price > 0
    AND projection_final::double precision > 20
    AND games_played >= 3
  ) AS is_valid_edge_candidate
FROM afl.player_rankings_cache
WHERE
  -- Hard eligibility: must have real price and projection
  price IS NOT NULL
  AND price > 0
  AND projection_final IS NOT NULL
  AND projection_final::double precision > 20
  -- Must have played at least 3 games (removes rookies/retired)
  AND games_played >= 3
  -- Must have a real team (removes ghost/retired entries)
  AND player_name IS NOT NULL
  AND team IS NOT NULL
  AND team != ''
  -- Availability checks
  AND COALESCE(is_available, true) = true
  AND COALESCE(status, 'AVAILABLE') NOT IN ('OUT', 'INJURED')
  AND COALESCE(manual_status, 'AVAILABLE') NOT IN ('OUT', 'INJURED', 'INACTIVE')
  -- Value must be meaningful
  AND value_score IS NOT NULL
  AND value_score > 0
  -- Explicit retired-player block (belt-and-suspenders)
  AND player_name NOT IN ('Mitchell Duncan');

GRANT SELECT ON afl.v_edge_board_core TO anon, authenticated, service_role;

-- ============================================================
-- Step 3: Rebuild v_edge_board_safe on top of v_edge_board_core
-- Landing page uses this for its 3-signal preview
-- ============================================================

CREATE VIEW public.v_edge_board_safe AS
WITH
captain AS (
  SELECT *, 'captain'::text AS signal_type
  FROM afl.v_edge_board_core
  ORDER BY COALESCE(captain_score, 0) DESC, projection_final DESC NULLS LAST
  LIMIT 1
),
remaining_1 AS (
  SELECT * FROM afl.v_edge_board_core
  WHERE player_id NOT IN (SELECT player_id FROM captain)
),
value_pick AS (
  SELECT *, 'breakout'::text AS signal_type
  FROM remaining_1
  ORDER BY COALESCE(best_value_score, value_score, 0) DESC, projection_final DESC NULLS LAST
  LIMIT 1
),
remaining_2 AS (
  SELECT * FROM remaining_1
  WHERE player_id NOT IN (SELECT player_id FROM value_pick)
),
trap_pick AS (
  SELECT *, 'trap'::text AS signal_type
  FROM remaining_2
  ORDER BY COALESCE(risk_rating, 0) DESC, COALESCE(projection_confidence, 100) ASC
  LIMIT 1
)
SELECT
  player_name,
  team,
  position,
  neeko_rating,
  projection_final,
  ceiling_estimate,
  projection_confidence,
  risk_rating,
  upside_rating,
  signal_type
FROM captain
UNION ALL
SELECT
  player_name,
  team,
  position,
  neeko_rating,
  projection_final,
  ceiling_estimate,
  projection_confidence,
  risk_rating,
  upside_rating,
  signal_type
FROM value_pick
UNION ALL
SELECT
  player_name,
  team,
  position,
  neeko_rating,
  projection_final,
  ceiling_estimate,
  projection_confidence,
  risk_rating,
  upside_rating,
  signal_type
FROM trap_pick;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated, service_role;

-- ============================================================
-- Step 4: Rebuild get_edge_board_data RPC to use v_edge_board_core
-- Edge board page uses this RPC for its full ranked sections
-- ============================================================

DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 10)
RETURNS TABLE(
  player_id            text,
  player_name          text,
  team                 text,
  "position"           text,
  section              text,
  section_rank         bigint,
  projection_final     numeric,
  ceiling_estimate     numeric,
  floor_estimate       numeric,
  upside_rating        numeric,
  risk_rating          numeric,
  projection_confidence double precision,
  captain_score        numeric,
  captain_rating       text,
  neeko_rating         numeric,
  price                integer,
  price_change         integer,
  value_score          numeric,
  value_tag            text,
  ai_summary           text,
  recommendation_color text,
  refreshed_at         timestamptz,
  edge_score           numeric,
  edge_tier            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $func$
WITH
captain_ranked AS (
  SELECT
    player_id::text,
    player_name,
    team,
    position,
    'captain'::text                                    AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank,
    projection_final::numeric,
    ceiling_estimate::numeric,
    floor_estimate::numeric,
    upside_rating::numeric,
    risk_rating::numeric,
    projection_confidence,
    captain_score::numeric,
    captain_rating,
    neeko_rating::numeric,
    price,
    price_change,
    value_score::numeric,
    value_tag,
    ai_summary,
    recommendation_color,
    cached_at                                          AS refreshed_at,
    captain_score::numeric                             AS edge_score,
    CASE
      WHEN captain_score >= 80 THEN 'elite'
      WHEN captain_score >= 60 THEN 'strong'
      ELSE 'moderate'
    END                                                AS edge_tier
  FROM afl.v_edge_board_core
),
breakout_ranked AS (
  SELECT
    player_id::text,
    player_name,
    team,
    position,
    'breakout'::text                                   AS section,
    ROW_NUMBER() OVER (
      ORDER BY COALESCE(best_value_score, value_score, 0) DESC,
               upside_rating DESC NULLS LAST
    )                                                  AS section_rank,
    projection_final::numeric,
    ceiling_estimate::numeric,
    floor_estimate::numeric,
    upside_rating::numeric,
    risk_rating::numeric,
    projection_confidence,
    captain_score::numeric,
    captain_rating,
    neeko_rating::numeric,
    price,
    price_change,
    value_score::numeric,
    value_tag,
    ai_summary,
    recommendation_color,
    cached_at                                          AS refreshed_at,
    COALESCE(best_value_score, value_score)::numeric   AS edge_score,
    CASE
      WHEN COALESCE(best_value_score, value_score) >= 15 THEN 'elite'
      WHEN COALESCE(best_value_score, value_score) >= 8  THEN 'strong'
      ELSE 'moderate'
    END                                                AS edge_tier
  FROM afl.v_edge_board_core
),
trap_ranked AS (
  SELECT
    player_id::text,
    player_name,
    team,
    position,
    'trap'::text                                       AS section,
    ROW_NUMBER() OVER (
      ORDER BY risk_rating DESC NULLS LAST,
               projection_confidence ASC NULLS LAST
    )                                                  AS section_rank,
    projection_final::numeric,
    ceiling_estimate::numeric,
    floor_estimate::numeric,
    upside_rating::numeric,
    risk_rating::numeric,
    projection_confidence,
    captain_score::numeric,
    captain_rating,
    neeko_rating::numeric,
    price,
    price_change,
    value_score::numeric,
    value_tag,
    ai_summary,
    recommendation_color,
    cached_at                                          AS refreshed_at,
    risk_rating::numeric                               AS edge_score,
    CASE
      WHEN risk_rating >= 45 THEN 'high'
      WHEN risk_rating >= 35 THEN 'medium'
      ELSE 'low'
    END                                                AS edge_tier
  FROM afl.v_edge_board_core
)
SELECT * FROM captain_ranked  WHERE section_rank <= limit_n
UNION ALL
SELECT * FROM breakout_ranked WHERE section_rank <= limit_n
UNION ALL
SELECT * FROM trap_ranked     WHERE section_rank <= limit_n
ORDER BY section, section_rank;
$func$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon, authenticated, service_role;
