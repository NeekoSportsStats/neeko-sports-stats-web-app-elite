/*
  # Add trend_signal and breakeven to get_edge_board_data RPC

  ## Changes
  - Drops and recreates `get_edge_board_data` to include `trend_signal` and `breakeven`
  - These fields are already present in afl.player_rankings_cache
  - Frontend Edge Board uses trend_signal for the signal badge display
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
    AND COALESCE(c.manual_status, c.status, '') NOT IN ('injured', 'inactive', 'inactive_ghost')
    AND COALESCE(c.is_bye, false) = false
    AND COALESCE(c.is_available, true) = true
),

captain_candidates AS (
  SELECT
    b.*,
    'captain'::text                      AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.captain_score, 0) DESC, COALESCE(b.projection_final, 0) DESC) AS section_rank
  FROM base b
  WHERE COALESCE(b.captain_score, 0) > 0
  LIMIT 5
),

breakout_candidates AS (
  SELECT
    b.*,
    'breakout'::text                     AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.value_score, 0) DESC, COALESCE(b.edge, 0) DESC) AS section_rank
  FROM base b
  WHERE
    b.player_id NOT IN (SELECT cc.player_id FROM captain_candidates cc)
    AND COALESCE(b.value_score, 0) > 0
    AND COALESCE(b.price, 0) < 600000
  LIMIT 5
),

trap_candidates AS (
  SELECT
    b.*,
    'trap'::text                         AS section,
    ROW_NUMBER() OVER (ORDER BY COALESCE(b.risk_rating, 0) DESC) AS section_rank
  FROM base b
  WHERE
    b.player_id NOT IN (SELECT cc.player_id FROM captain_candidates cc)
    AND b.player_id NOT IN (SELECT bc.player_id FROM breakout_candidates bc)
    AND COALESCE(b.risk_rating, 0) >= 6
  LIMIT 5
),

combined AS (
  SELECT * FROM captain_candidates
  UNION ALL
  SELECT * FROM breakout_candidates
  UNION ALL
  SELECT * FROM trap_candidates
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
