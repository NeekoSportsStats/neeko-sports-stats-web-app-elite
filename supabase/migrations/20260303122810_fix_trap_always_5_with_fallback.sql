/*
  # Fix Trap: always return 5 rows with fallback

  ## Changes (Trap section only)
  1. Primary pool: neeko_rating_rank <= 50
  2. Strict eligible: must meet >= 2 of: risk >= 60, consistency <= 45, value_tier = POOR, conf <= 50
  3. Fallback: if strict < 5, fill remaining slots from top-50 ordered by risk_rating DESC (excluding already selected)
  4. Final sort: risk_rating DESC, value_score ASC; LIMIT 5

  ## Unchanged
  - Captain section logic
  - Breakout section logic
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
    r.player_id::text                         AS player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence::numeric          AS projection_confidence,
    r.captain_score,
    r.captain_rating,
    r.neeko_rating,
    r.price::numeric                          AS price,
    r.value_score,
    r.value_tier,
    r.value_tag,
    r.consistency_score,
    r.ai_summary,
    r.recommendation_color,
    ROW_NUMBER() OVER (ORDER BY r.neeko_rating DESC NULLS LAST) AS neeko_rating_rank
  FROM public.v_rankings_canonical r
),
trap_strict AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 50
    AND (
      (CASE WHEN risk_rating >= 60           THEN 1 ELSE 0 END) +
      (CASE WHEN consistency_score <= 45     THEN 1 ELSE 0 END) +
      (CASE WHEN value_tier = 'POOR'         THEN 1 ELSE 0 END) +
      (CASE WHEN projection_confidence <= 50 THEN 1 ELSE 0 END)
    ) >= 2
),
trap_fallback AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 50
    AND player_id NOT IN (SELECT player_id FROM trap_strict WHERE player_id IS NOT NULL)
    AND player_name NOT IN (SELECT player_name FROM trap_strict)
  ORDER BY risk_rating DESC NULLS LAST
),
trap_combined AS (
  SELECT *, 1 AS priority FROM trap_strict
  UNION ALL
  SELECT *, 2 AS priority FROM trap_fallback
),
trap_final AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
    ) AS trap_rn
  FROM trap_combined
),
sectioned AS (
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM ranked
  UNION ALL
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST) AS section_rank
  FROM ranked
  WHERE value_score > 100
  UNION ALL
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn AS section_rank
  FROM trap_final
  WHERE trap_rn <= 5
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
