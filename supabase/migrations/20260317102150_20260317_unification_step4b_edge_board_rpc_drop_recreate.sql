/*
  # NEEKO SPORTS — FULL SYSTEM UNIFICATION: Step 4b
  Drop and recreate get_edge_board_data() with edge_score and edge_tier in return type

  ## Summary
  Must drop before recreating because the return type changes (adding two new columns).
  The function is immediately recreated with identical logic plus the two new fields.
*/

DROP FUNCTION IF EXISTS public.get_edge_board_data(integer);

CREATE FUNCTION public.get_edge_board_data(limit_n integer)
RETURNS TABLE(
  player_id text, player_name text, team text, "position" text,
  section text, section_rank bigint,
  projection_final numeric, ceiling_estimate numeric, floor_estimate numeric,
  upside_rating numeric, risk_rating numeric, projection_confidence numeric,
  captain_score numeric, captain_rating text, neeko_rating numeric,
  price numeric, value_score numeric, value_tag text,
  ai_summary text, recommendation_color text,
  refreshed_at timestamp with time zone,
  edge_score integer,
  edge_tier text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_mv_count integer;
BEGIN
  SELECT COUNT(*) INTO v_mv_count FROM public.mv_edge_board;

  IF v_mv_count > 0 THEN
    RETURN QUERY
    SELECT
      m.player_id, m.player_name, m.team, m."position",
      m.section, m.section_rank,
      m.projection_final, m.ceiling_estimate, m.floor_estimate,
      m.upside_rating, m.risk_rating, m.projection_confidence,
      m.captain_score, m.captain_rating, m.neeko_rating,
      m.price, m.value_score, m.value_tag,
      m.ai_summary, m.recommendation_color, m.refreshed_at,
      c.edge_score::integer,
      c.edge_tier
    FROM public.mv_edge_board m
    LEFT JOIN afl.player_rankings_cache c ON c.player_id::text = m.player_id
    WHERE m.section_rank <= limit_n
    ORDER BY m.section, m.section_rank;

  ELSE
    RETURN QUERY
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
        (COALESCE(r.ceiling_estimate, 0) - COALESCE(r.projection_final, 0)) AS ceiling_gap,
        ROW_NUMBER() OVER (ORDER BY r.neeko_rating     DESC NULLS LAST) AS neeko_rating_rank,
        ROW_NUMBER() OVER (ORDER BY r.captain_score    DESC NULLS LAST) AS captain_rank
      FROM public.v_rankings_canonical r
    ),
    captain_eligible AS (
      SELECT * FROM ranked WHERE captain_score IS NOT NULL
    ),
    breakout_eligible AS (
      SELECT * FROM ranked
      WHERE ceiling_gap           >= 50
      AND   projection_final      >= 50
      AND   floor_estimate        >= 25
      AND   projection_confidence >= 40
      AND   risk_rating           <= 75
      AND   captain_rank          >  5
    ),
    trap_strict AS (
      SELECT * FROM ranked
      WHERE neeko_rating_rank <= 100
      AND (risk_rating >= 50 OR value_score < 95)
      AND (
        (CASE WHEN risk_rating           >= 55 THEN 1 ELSE 0 END) +
        (CASE WHEN consistency_score     <= 50 THEN 1 ELSE 0 END) +
        (CASE WHEN value_score           <  95 THEN 1 ELSE 0 END) +
        (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
      ) >= 2
    ),
    trap_fallback AS (
      SELECT * FROM ranked
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
        ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
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
      s.player_id, s.player_name, s.team, s."position",
      s.section, s.section_rank,
      s.projection_final, s.ceiling_estimate, s.floor_estimate,
      s.upside_rating, s.risk_rating, s.projection_confidence,
      s.captain_score, s.captain_rating, s.neeko_rating,
      s.price, s.value_score, s.value_tag,
      s.ai_summary, s.recommendation_color,
      now() AS refreshed_at,
      c.edge_score::integer,
      c.edge_tier
    FROM sectioned s
    LEFT JOIN afl.player_rankings_cache c ON c.player_id::text = s.player_id
    WHERE s.section_rank <= limit_n
    ORDER BY s.section, s.section_rank;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_edge_board_data(integer) TO authenticated, anon;
