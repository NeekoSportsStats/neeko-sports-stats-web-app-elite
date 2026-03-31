/*
  # Fix get_edge_board_data — Trap: require price >= 750000 as mandatory condition

  ## Problem
  The "2 of 4 conditions" eligibility was correct in logic but low-price rookies
  with extreme risk_rating / low projection_confidence were dominating because
  they satisfied 3 conditions without price. The intent of "High-End Risk Premium"
  requires the player to actually be premium-priced.

  ## Fix
  Trap eligibility now requires:
    - price >= 750000 (mandatory)
    - PLUS at least ONE of: risk_rating >= 60, projection_confidence <= 65, value_score < 95

  Ranking formula unchanged.
*/

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n int)
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
AS $func$
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
  SELECT *,
    'trap'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY (
        (risk_rating * 0.6)
        + ((100 - projection_confidence) * 0.3)
        + (CASE WHEN value_score < 95 THEN 10 ELSE 0 END)
      ) DESC NULLS LAST
    ) AS section_rank
  FROM ranked
  WHERE price >= 750000
    AND (
      risk_rating >= 60
      OR projection_confidence <= 65
      OR value_score < 95
    )
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
$func$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data(int) TO authenticated;
