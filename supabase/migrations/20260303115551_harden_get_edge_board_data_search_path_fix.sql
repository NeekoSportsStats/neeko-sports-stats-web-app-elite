/*
  # Harden get_edge_board_data — search_path fix for PostgREST 500

  ## Problem
  PostgREST returns 500 despite function working in SQL editor.
  Root cause: SECURITY DEFINER functions without SET search_path = public
  can resolve views/tables under a different schema at runtime when called
  via PostgREST, causing column resolution failures.

  ## Fix
  - SET search_path = public explicitly on the function
  - All numeric types aligned to numeric (PostgREST serialises consistently)
  - price cast to numeric (was integer — avoids implicit cast rejection)
  - projection_confidence cast to numeric (was double precision)
  - section_rank remains bigint (ROW_NUMBER() native type)
  - Grants re-applied to anon + authenticated
*/

DROP FUNCTION IF EXISTS public.get_edge_board_data(int);

CREATE FUNCTION public.get_edge_board_data(limit_n int)
RETURNS TABLE (
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
  projection_confidence numeric,
  captain_score        numeric,
  captain_rating       text,
  neeko_rating         numeric,
  price                numeric,
  value_score          numeric,
  value_tag            text,
  ai_summary           text,
  recommendation_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH ranked AS (
  SELECT
    r.player_id::text                        AS player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence::numeric         AS projection_confidence,
    r.captain_score,
    r.captain_rating,
    r.neeko_rating,
    r.price::numeric                         AS price,
    r.value_score,
    r.value_tag,
    r.ai_summary,
    r.recommendation_color
  FROM public.v_rankings_canonical r
),
sectioned AS (
  SELECT *, 'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM ranked
  UNION ALL
  SELECT *, 'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST) AS section_rank
  FROM ranked
  WHERE value_score > 100
  UNION ALL
  SELECT *, 'trap'::text AS section,
    ROW_NUMBER() OVER (ORDER BY risk_rating DESC NULLS LAST) AS section_rank
  FROM ranked
  WHERE value_score < 110
)
SELECT
  s.player_id,
  s.player_name,
  s.team,
  s.position,
  s.section,
  s.section_rank,
  s.projection_final,
  s.ceiling_estimate,
  s.floor_estimate,
  s.upside_rating,
  s.risk_rating,
  s.projection_confidence,
  s.captain_score,
  s.captain_rating,
  s.neeko_rating,
  s.price,
  s.value_score,
  s.value_tag,
  s.ai_summary,
  s.recommendation_color
FROM sectioned s
WHERE s.section_rank <= limit_n
ORDER BY s.section, s.section_rank;
$$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO authenticated;
