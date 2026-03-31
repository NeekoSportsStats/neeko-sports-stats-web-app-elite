/*
  # Fix mv_edge_board duplicate player_id rows

  ## Root cause
  The `sectioned` CTE is a UNION ALL of captain, breakout, and trap sections.
  A player can qualify for multiple sections simultaneously (e.g. high captain_score
  AND large ceiling_gap = appears in both captain AND breakout). The final SELECT
  had no deduplication, so those players produced multiple rows.

  52 players were affected (49 captain+breakout, 3 captain+trap).
  The upstream tables (player_rankings_cache, ai_player_analysis) are clean — no
  upstream duplicates exist.

  ## Fix
  After the UNION ALL in `sectioned`, apply DISTINCT ON (player_id) with a
  deterministic priority ordering: captain > breakout > trap.
  This is expressed by assigning section_priority (1/2/3) and using
  DISTINCT ON (player_id) ORDER BY player_id, section_priority ASC.

  The unique index mv_edge_board_player_idx is then recreated so that
  REFRESH MATERIALIZED VIEW CONCURRENTLY works.

  ## No changes to
  - Eligibility criteria for any section
  - Ranking formulas or score calculations
  - Any upstream views or tables
*/

DROP MATERIALIZED VIEW IF EXISTS public.mv_edge_board;

CREATE MATERIALIZED VIEW public.mv_edge_board AS
WITH ranked AS (
  SELECT
    c.player_id::text                                                           AS player_id,
    c.player_name,
    c.team,
    c.position,
    c.projection_final::numeric                                                 AS projection_final,
    c.ceiling::numeric                                                          AS ceiling_estimate,
    c.floor::numeric                                                            AS floor_estimate,
    c.upside_rating::numeric                                                    AS upside_rating,
    c.risk_rating::numeric                                                      AS risk_rating,
    c.projection_confidence::numeric                                            AS projection_confidence,
    c.captain_score::numeric                                                    AS captain_score,
    c.captain_rating,
    c.neeko_rating::numeric                                                     AS neeko_rating,
    c.price::numeric                                                            AS price,
    c.value_score::numeric                                                      AS value_score,
    c.value_tier,
    c.value_tag,
    c.consistency::numeric                                                      AS consistency_score,
    c.ai_summary,
    c.recommendation_color,
    (COALESCE(c.ceiling, 0::double precision)
      - COALESCE(c.projection_final, 0::double precision))::numeric            AS ceiling_gap,
    row_number() OVER (ORDER BY c.neeko_rating          DESC NULLS LAST)       AS neeko_rating_rank,
    row_number() OVER (ORDER BY c.captain_score         DESC NULLS LAST)       AS captain_rank,
    row_number() OVER (ORDER BY (COALESCE(c.ceiling, 0::double precision)
      - COALESCE(c.projection_final, 0::double precision)) DESC NULLS LAST)    AS ceiling_gap_rank
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
),

captain_eligible AS (
  SELECT * FROM ranked
  WHERE captain_score IS NOT NULL
),

breakout_eligible AS (
  SELECT * FROM ranked
  WHERE
    ceiling_gap         >= 50
    AND projection_final >= 50
    AND floor_estimate   >= 25
    AND projection_confidence >= 40
    AND risk_rating      <= 75
    AND captain_rank      > 5
),

trap_strict AS (
  SELECT * FROM ranked
  WHERE
    neeko_rating_rank <= 100
    AND (risk_rating >= 50 OR value_score < 9.5)
    AND (
        CASE WHEN risk_rating        >= 55   THEN 1 ELSE 0 END
      + CASE WHEN consistency_score  <= 50   THEN 1 ELSE 0 END
      + CASE WHEN value_score         < 9.5  THEN 1 ELSE 0 END
      + CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END
    ) >= 2
),

trap_fallback AS (
  SELECT * FROM ranked
  WHERE
    neeko_rating_rank <= 100
    AND player_name NOT IN (SELECT player_name FROM trap_strict)
  ORDER BY risk_rating DESC NULLS LAST, value_score
),

trap_combined AS (
  SELECT *, 1 AS trap_priority FROM trap_strict
  UNION ALL
  SELECT *, 2 AS trap_priority FROM trap_fallback
),

trap_final AS (
  SELECT *,
    row_number() OVER (
      ORDER BY trap_priority, risk_rating DESC NULLS LAST, value_score
    ) AS trap_rn
  FROM trap_combined
),

/*
  sectioned_raw: UNION ALL of all three sections with an explicit
  section_priority so we can deduplicate below.
    1 = captain  (highest priority)
    2 = breakout
    3 = trap
*/
sectioned_raw AS (
  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color,
    'captain'::text AS section,
    row_number() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank,
    1 AS section_priority
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color,
    'breakout'::text AS section,
    row_number() OVER (
      ORDER BY ceiling_gap DESC NULLS LAST, projection_confidence DESC NULLS LAST
    ) AS section_rank,
    2 AS section_priority
  FROM breakout_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn      AS section_rank,
    3 AS section_priority
  FROM trap_final
  WHERE trap_rn <= 5
),

/*
  deduped: keep exactly one row per player, preferring the lowest
  section_priority (captain beats breakout beats trap).
  Within the same section_priority, prefer the highest section_rank score
  (lowest rank number = best position).
*/
deduped AS (
  SELECT DISTINCT ON (player_id)
    *
  FROM sectioned_raw
  ORDER BY player_id, section_priority ASC, section_rank ASC
)

SELECT
  player_id,
  player_name,
  team,
  position,
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
  value_score,
  value_tag,
  ai_summary,
  recommendation_color,
  now() AS refreshed_at
FROM deduped;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX mv_edge_board_player_idx
  ON public.mv_edge_board (player_id);
