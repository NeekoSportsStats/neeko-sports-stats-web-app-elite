/*
  # Create get_edge_board_data RPC

  ## Purpose
  Edge Board requires full player data (ai_summary, price, value_score, etc.)
  sorted independently for three categories: captain, breakout, and trap.

  The existing get_rankings_free RPC nulls out premium intel for rows ranked
  outside the top 5 by neeko_rating. This breaks Edge Board because it needs
  players ranked by captain_score, upside_rating, and risk_rating — entirely
  different sort orders where the relevant players fall outside the neeko top 5.

  ## What this migration does
  1. Creates get_edge_board_data() — returns full columns from v_rankings_canonical
     with NO freemium null-gating (Edge Board handles its own UI paywall)
  2. Returns separate ranked lists for captain, breakout, and trap sections
  3. Security: SECURITY DEFINER + grants to anon/authenticated

  ## Columns returned
  Full set from v_rankings_canonical: player_id, player_name, team, position,
  projection_final, ceiling_estimate, floor_estimate, upside_rating, risk_rating,
  projection_confidence, captain_score, captain_rating, neeko_rating, price,
  value_score, value_tag, ai_summary, recommendation_color
*/

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer DEFAULT 10)
RETURNS TABLE(
  player_id           text,
  player_name         text,
  team                text,
  "position"          text,
  section             text,
  section_rank        integer,
  projection_final    numeric,
  ceiling_estimate    numeric,
  floor_estimate      numeric,
  upside_rating       numeric,
  risk_rating         numeric,
  projection_confidence double precision,
  captain_score       numeric,
  captain_rating      text,
  neeko_rating        numeric,
  price               integer,
  value_score         numeric,
  value_tag           text,
  ai_summary          text,
  recommendation_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $func$
WITH captain_ranked AS (
  SELECT
    c.player_id::text,
    c.player_name,
    c.team,
    c.position,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY c.captain_score DESC NULLS LAST)::integer AS section_rank,
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
    c.player_id::text,
    c.player_name,
    c.team,
    c.position,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY c.upside_rating DESC NULLS LAST)::integer AS section_rank,
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
    c.player_id::text,
    c.player_name,
    c.team,
    c.position,
    'trap'::text AS section,
    ROW_NUMBER() OVER (ORDER BY c.risk_rating DESC NULLS LAST)::integer AS section_rank,
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
SELECT * FROM captain_ranked WHERE section_rank <= limit_n
UNION ALL
SELECT * FROM breakout_ranked WHERE section_rank <= limit_n
UNION ALL
SELECT * FROM trap_ranked WHERE section_rank <= limit_n
ORDER BY section, section_rank;
$func$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO authenticated;
