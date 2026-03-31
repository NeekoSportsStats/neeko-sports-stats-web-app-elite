
/*
  # Fix public.mv_edge_board column type alignment

  ## Problem
  The RPC get_edge_board_data() declares its return type as NUMERIC for several
  columns (projection_final, ceiling_estimate, floor_estimate, etc.) but the MV
  stores them as double precision (from afl.player_rankings_cache).

  PostgreSQL requires exact type match between RETURN QUERY and the function
  return type declaration, causing a runtime error.

  ## Fix
  Rebuild the MV with explicit ::numeric casts on all numeric columns so the
  types match the RPC RETURNS TABLE declaration exactly.

  ## RPC return type (from existing get_edge_board_data definition)
  projection_final        numeric
  ceiling_estimate        numeric
  floor_estimate          numeric
  upside_rating           numeric
  risk_rating             numeric
  projection_confidence   numeric
  captain_score           numeric
  neeko_rating            numeric
  price                   numeric
  value_score             numeric
  section_rank            bigint  (already correct from ROW_NUMBER)
*/

DROP MATERIALIZED VIEW IF EXISTS public.mv_edge_board;

CREATE MATERIALIZED VIEW public.mv_edge_board AS
WITH ranked AS (
  SELECT
    c.player_id::text                                  AS player_id,
    c.player_name,
    c.team,
    c.position,
    c.projection_final::numeric                        AS projection_final,
    c.ceiling::numeric                                 AS ceiling_estimate,
    c.floor::numeric                                   AS floor_estimate,
    c.upside_rating::numeric                           AS upside_rating,
    c.risk_rating::numeric                             AS risk_rating,
    c.projection_confidence::numeric                   AS projection_confidence,
    c.captain_score::numeric                           AS captain_score,
    c.captain_rating,
    c.neeko_rating::numeric                            AS neeko_rating,
    c.price::numeric                                   AS price,
    c.value_score::numeric                             AS value_score,
    c.value_tier,
    c.value_tag,
    c.consistency::numeric                             AS consistency_score,
    c.ai_summary,
    c.recommendation_color,
    ROW_NUMBER()   OVER (ORDER BY c.neeko_rating     DESC NULLS LAST) AS neeko_rating_rank,
    ROW_NUMBER()   OVER (ORDER BY c.captain_score    DESC NULLS LAST) AS captain_rank,
    PERCENT_RANK() OVER (ORDER BY c.upside_rating    ASC  NULLS FIRST) AS upside_percentile
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
),
captain_eligible AS (
  SELECT * FROM ranked WHERE captain_score IS NOT NULL
),
breakout_eligible AS (
  SELECT *
  FROM ranked
  WHERE upside_percentile    >= 0.65
    AND value_score          > 100
    AND projection_final     >= 50
    AND floor_estimate       >= 25
    AND projection_confidence >= 40
    AND captain_rank         > 5
),
trap_strict AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND (risk_rating >= 50 OR value_score < 95)
    AND (
          (CASE WHEN risk_rating >= 55           THEN 1 ELSE 0 END) +
          (CASE WHEN consistency_score <= 50     THEN 1 ELSE 0 END) +
          (CASE WHEN value_score < 95            THEN 1 ELSE 0 END) +
          (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
        ) >= 2
),
trap_fallback AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND player_name NOT IN (SELECT player_name FROM trap_strict)
  ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
),
trap_combined AS (
  SELECT *, 1 AS trap_priority FROM trap_strict
  UNION ALL
  SELECT *, 2 AS trap_priority FROM trap_fallback
),
trap_final AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
    ) AS trap_rn
  FROM trap_combined
),
sectioned AS (
  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY upside_rating DESC NULLS LAST, value_score DESC NULLS LAST
    ) AS section_rank
  FROM breakout_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn      AS section_rank
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
  s.recommendation_color,
  now() AS refreshed_at
FROM sectioned s;

CREATE INDEX IF NOT EXISTS idx_mv_edge_board_section_rank
  ON public.mv_edge_board (section, section_rank);

GRANT SELECT ON public.mv_edge_board TO anon, authenticated;
