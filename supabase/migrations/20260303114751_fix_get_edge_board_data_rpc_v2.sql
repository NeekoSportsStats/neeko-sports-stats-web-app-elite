/*
  # Fix get_edge_board_data RPC — v2 clean rebuild

  ## Problem
  PostgREST returning 500 on RPC call. Root cause: RETURNS TABLE column types
  must exactly match the SELECT output types in order. This rebuild:
  - Drops the old function first to avoid signature conflicts
  - Uses exact types matching v_rankings_canonical columns
  - section_rank uses BIGINT (ROW_NUMBER() native type, no cast needed)
  - projection_confidence uses double precision (matches canonical)
  - No implicit casts

  ## Sections returned
  - captain: top N by captain_score DESC
  - breakout: top N by upside_rating DESC where value_score > 100
  - trap: top N by risk_rating DESC where value_score < 110

  ## Security
  SECURITY DEFINER, granted to anon + authenticated
*/

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
  value_score          numeric,
  value_tag            text,
  ai_summary           text,
  recommendation_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $func$
WITH captain_ranked AS (
  SELECT
    c.player_id::text                                                          AS player_id,
    c.player_name,
    c.team,
    c.position,
    'captain'::text                                                            AS section,
    ROW_NUMBER() OVER (ORDER BY c.captain_score DESC NULLS LAST)              AS section_rank,
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
    c.value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color
  FROM public.v_rankings_canonical c
  WHERE c.captain_score IS NOT NULL
),
breakout_ranked AS (
  SELECT
    c.player_id::text                                                          AS player_id,
    c.player_name,
    c.team,
    c.position,
    'breakout'::text                                                           AS section,
    ROW_NUMBER() OVER (ORDER BY c.upside_rating DESC NULLS LAST)              AS section_rank,
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
    c.value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color
  FROM public.v_rankings_canonical c
  WHERE c.upside_rating IS NOT NULL
    AND c.value_score > 100
),
trap_ranked AS (
  SELECT
    c.player_id::text                                                          AS player_id,
    c.player_name,
    c.team,
    c.position,
    'trap'::text                                                               AS section,
    ROW_NUMBER() OVER (ORDER BY c.risk_rating DESC NULLS LAST)                AS section_rank,
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
    c.value_score,
    c.value_tag,
    c.ai_summary,
    c.recommendation_color
  FROM public.v_rankings_canonical c
  WHERE c.risk_rating IS NOT NULL
    AND c.value_score < 110
)
SELECT * FROM captain_ranked  WHERE section_rank <= limit_n
UNION ALL
SELECT * FROM breakout_ranked WHERE section_rank <= limit_n
UNION ALL
SELECT * FROM trap_ranked     WHERE section_rank <= limit_n
ORDER BY section, section_rank;
$func$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO authenticated;
