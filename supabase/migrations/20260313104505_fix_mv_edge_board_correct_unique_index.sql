/*
  # Fix mv_edge_board unique index — correct key is (player_id, section)

  ## Root cause clarification
  The edge board MV deliberately stores up to 5 rows per section (captain, breakout,
  trap) — 15 rows total. A player CAN appear in multiple sections simultaneously
  (e.g. ranked #1 captain AND qualifies as a breakout). This is intentional: the
  frontend filters by section independently.

  The original error was a UNIQUE INDEX on (player_id) alone, which collides when
  a player appears in two sections. The correct constraint is (player_id, section)
  — unique within each section.

  ## Fix
  1. Drop the wrong single-column unique index created in the previous migration
  2. Restore the MV to its correct form: UNION ALL of all three sections, no
     cross-section deduplication, capped at section_rank <= 5 per section
  3. Create the correct composite unique index on (player_id, section)

  ## No changes to
  - Eligibility criteria for any section
  - Ranking formulas or score calculations
  - Any upstream views or tables
*/

DROP MATERIALIZED VIEW IF EXISTS public.mv_edge_board;

CREATE MATERIALIZED VIEW public.mv_edge_board AS
WITH ranked AS (
  SELECT
    c.player_id::text                                                            AS player_id,
    c.player_name,
    c.team,
    c.position,
    c.projection_final::numeric                                                  AS projection_final,
    c.ceiling::numeric                                                           AS ceiling_estimate,
    c.floor::numeric                                                             AS floor_estimate,
    c.upside_rating::numeric                                                     AS upside_rating,
    c.risk_rating::numeric                                                       AS risk_rating,
    c.projection_confidence::numeric                                             AS projection_confidence,
    c.captain_score::numeric                                                     AS captain_score,
    c.captain_rating,
    c.neeko_rating::numeric                                                      AS neeko_rating,
    c.price::numeric                                                             AS price,
    c.value_score::numeric                                                       AS value_score,
    c.value_tier,
    c.value_tag,
    c.consistency::numeric                                                       AS consistency_score,
    c.ai_summary,
    c.recommendation_color,
    (COALESCE(c.ceiling, 0::double precision)
      - COALESCE(c.projection_final, 0::double precision))::numeric             AS ceiling_gap,
    row_number() OVER (ORDER BY c.neeko_rating          DESC NULLS LAST)        AS neeko_rating_rank,
    row_number() OVER (ORDER BY c.captain_score         DESC NULLS LAST)        AS captain_rank,
    row_number() OVER (ORDER BY (COALESCE(c.ceiling, 0::double precision)
      - COALESCE(c.projection_final, 0::double precision)) DESC NULLS LAST)     AS ceiling_gap_rank
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
    ceiling_gap          >= 50
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
        CASE WHEN risk_rating          >= 55  THEN 1 ELSE 0 END
      + CASE WHEN consistency_score    <= 50  THEN 1 ELSE 0 END
      + CASE WHEN value_score           < 9.5 THEN 1 ELSE 0 END
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

sectioned AS (
  -- CAPTAIN: all eligible, ranked by captain_score, capped at 5
  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color,
    'captain'::text AS section,
    row_number() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  -- BREAKOUT: eligible players, ranked by ceiling_gap then confidence, capped at 5
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
    ) AS section_rank
  FROM breakout_eligible

  UNION ALL

  -- TRAP: top 5 from trap logic
  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag,
    ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn       AS section_rank
  FROM trap_final
  WHERE trap_rn <= 5
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
FROM sectioned
WHERE section_rank <= 5;

-- Correct composite unique index: unique within each section, not globally
-- This is what REFRESH MATERIALIZED VIEW CONCURRENTLY requires
CREATE UNIQUE INDEX mv_edge_board_player_section_idx
  ON public.mv_edge_board (player_id, section);
