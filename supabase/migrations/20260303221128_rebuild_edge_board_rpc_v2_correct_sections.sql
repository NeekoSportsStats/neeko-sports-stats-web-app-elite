/*
  # Rebuild get_edge_board_data RPC — v2 Correct Sections

  ## Summary
  Rewrites the three Edge Board sections to match spec requirements exactly.

  ## Changes

  ### Captain Picks
  - Filter: captain_score IS NOT NULL
  - Sort: captain_score DESC
  - Returns: top limit_n players

  ### Breakout Watch
  - Filter: high upside_rating (upside_percentile >= 0.65), positive trend indicators
    (value_score > 100, projection_final >= 50, floor_estimate >= 25, projection_confidence >= 40)
  - Excludes: players already in captain top-5 where possible (using captain_rank > 5)
  - Sort: upside_rating DESC, value_score DESC
  - Returns: top limit_n players

  ### Trap Alert
  - Pool: top 100 neeko_rating players (neeko_rating_rank <= 100)
  - Filter: high risk_rating, low value_score (risk_rating >= 50 OR value_score < 95)
  - Sort: risk_rating DESC, value_score ASC (most dangerous first)
  - Fallback: if < limit_n strict rows, fill from top-100 by risk_rating DESC
  - Returns: top limit_n players

  ## Security
  - SECURITY DEFINER with SET search_path = public
  - GRANT EXECUTE to anon and authenticated
*/

CREATE OR REPLACE FUNCTION public.get_edge_board_data(limit_n integer)
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH ranked AS (
  SELECT
    r.player_id::text                              AS player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence::numeric               AS projection_confidence,
    r.captain_score,
    r.captain_rating,
    r.neeko_rating,
    r.price::numeric                               AS price,
    r.value_score,
    r.value_tier,
    r.value_tag,
    r.consistency_score,
    r.ai_summary,
    r.recommendation_color,
    ROW_NUMBER()   OVER (ORDER BY r.neeko_rating     DESC NULLS LAST) AS neeko_rating_rank,
    ROW_NUMBER()   OVER (ORDER BY r.captain_score    DESC NULLS LAST) AS captain_rank,
    PERCENT_RANK() OVER (ORDER BY r.upside_rating    ASC  NULLS FIRST) AS upside_percentile
  FROM public.v_rankings_canonical r
),

-- ── Captain: top players by captain_score ────────────────────────────────────
captain_eligible AS (
  SELECT *
  FROM ranked
  WHERE captain_score IS NOT NULL
),

-- ── Breakout: high upside, positive form, exclude top captain locks ──────────
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

-- ── Trap: top 100 neeko_rating players with high risk or low value ───────────
trap_strict AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND (
      risk_rating >= 50
      OR value_score < 95
    )
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
    AND player_id NOT IN (SELECT player_id FROM trap_strict WHERE player_id IS NOT NULL)
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

-- ── Assemble all three sections ───────────────────────────────────────────────
sectioned AS (
  SELECT
    player_id, player_name, team, "position",
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, "position",
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO authenticated;
