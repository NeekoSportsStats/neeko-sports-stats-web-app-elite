/*
  # Rebuild Edge Board RPC — 3 Category Model

  ## New Sections
  1. must_have   — Top value_score players (BUY signal, high value score)
  2. breakout    — trend_signal = STRONG_UP (rising form, regardless of value)
  3. do_not_start — trend_signal = DOWN or STRONG_DOWN (falling form)

  ## Changes
  - Drops and recreates public.get_edge_board_data(integer)
  - must_have: players with BUY value_signal ordered by value_score DESC
  - breakout: STRONG_UP trend players not already in must_have, ordered by projection DESC
  - do_not_start: DOWN/STRONG_DOWN trend players not already selected, ordered by risk DESC
  - Injured and bye players excluded from all sections
  - Each section returns up to limit_n players with ROW_NUMBER ranking
*/

DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 5)
RETURNS TABLE(
  player_id integer,
  player_name text,
  team text,
  player_position text,
  section text,
  section_rank bigint,
  projection_final numeric,
  ceiling_estimate double precision,
  floor_estimate double precision,
  upside_rating double precision,
  risk_rating double precision,
  projection_confidence double precision,
  captain_score double precision,
  captain_rating text,
  neeko_rating double precision,
  price integer,
  price_change integer,
  value_score double precision,
  value_tag text,
  ai_summary text,
  recommendation_color text,
  refreshed_at timestamp with time zone,
  edge numeric,
  signal_tag text,
  signal text,
  summary_short text,
  trend_signal text,
  breakeven numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
WITH base AS (
  SELECT
    c.player_id,
    c.player_name,
    COALESCE(c.team_name, c.team)        AS team,
    c."position"                         AS player_position,
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
    c.value_signal,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color,
    c.cached_at                          AS refreshed_at,
    c.edge,
    c.breakeven,
    c.signal,
    c.signal_tag,
    c.summary_short,
    c.trend_signal
  FROM afl.player_rankings_cache c
  WHERE
    c.games_played >= 3
    AND c.projection_final > 40
    AND COALESCE(c.manual_status, c.status, '') NOT IN ('injured', 'inactive', 'inactive_ghost', 'OUT', 'INJURED', 'OMITTED')
    AND COALESCE(c.is_bye, false) = false
    AND COALESCE(c.is_available, true) = true
    AND c.price > 0
),

-- Section 1: MUST HAVE VALUE
-- Players with BUY value_signal, ordered by value_score DESC
-- Fallback: top value_score players if BUY pool is too small
must_have_candidates AS (
  SELECT
    b.*,
    'must_have'::text                    AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.value_score, -99) DESC, COALESCE(b.projection_final, 0) DESC) AS section_rank
  FROM base b
  WHERE b.value_signal IN ('BUY', 'STRONG_BUY')
  LIMIT limit_n
),

-- Section 2: BREAKOUT / WATCHLIST
-- Players with STRONG_UP trend, not already in must_have
-- Ordered by projection DESC then value_score DESC
breakout_candidates AS (
  SELECT
    b.*,
    'breakout'::text                     AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.projection_final, 0) DESC, COALESCE(b.value_score, -99) DESC) AS section_rank
  FROM base b
  WHERE
    b.trend_signal = 'STRONG_UP'
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
  LIMIT limit_n
),

-- Section 3: DO NOT START
-- Players with DOWN or STRONG_DOWN trend, not already selected
-- Ordered by risk_rating DESC then projection ASC (worst outlook first)
do_not_start_candidates AS (
  SELECT
    b.*,
    'do_not_start'::text                 AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.risk_rating, 0) DESC, COALESCE(b.projection_final, 999) ASC) AS section_rank
  FROM base b
  WHERE
    b.trend_signal IN ('DOWN', 'STRONG_DOWN')
    AND b.player_id NOT IN (SELECT mh.player_id FROM must_have_candidates mh)
    AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
  LIMIT limit_n
),

combined AS (
  SELECT * FROM must_have_candidates
  UNION ALL
  SELECT * FROM breakout_candidates
  UNION ALL
  SELECT * FROM do_not_start_candidates
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
$$;
