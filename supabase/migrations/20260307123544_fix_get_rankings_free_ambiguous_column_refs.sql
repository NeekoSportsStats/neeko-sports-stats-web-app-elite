/*
  # Fix get_rankings_free — ambiguous column references in sorted CTE ORDER BY

  The CASE expressions in the sorted CTE ORDER BY clause reference bare column
  names (value_score, projection_final, neeko_rating) which PL/pgSQL confuses
  with output column variables when they share names with the RETURNS TABLE
  declaration. Fix by qualifying them with the filtered CTE alias in the
  ROW_NUMBER window, and using the sort_key parameter via a local variable
  to avoid the parameter-name ambiguity.
*/

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  position_filter text DEFAULT 'ALL',
  sort_key text DEFAULT 'neeko_rating',
  limit_n integer DEFAULT 200
)
RETURNS TABLE(
  player_id text,
  player_name text,
  team text,
  "position" text,
  projection_final numeric,
  ceiling_estimate numeric,
  floor_estimate numeric,
  consistency_score double precision,
  form_rating numeric,
  matchup_rating numeric,
  upside_rating numeric,
  risk_rating numeric,
  projection_confidence numeric,
  captain_score numeric,
  captain_rating text,
  neeko_rating numeric,
  price integer,
  value_score numeric,
  value_tag text,
  value_tier text,
  ai_recommendation text,
  ai_summary text,
  ai_updated_at timestamp with time zone,
  recommendation_why text,
  recommendation_color text,
  consistency_tier text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sort_key text := sort_key;
  v_position_filter text := position_filter;
  v_limit_n integer := limit_n;
BEGIN
RETURN QUERY
WITH filtered AS (
  SELECT
    c.player_id::text                  AS f_player_id,
    c.player_name                      AS f_player_name,
    c.team                             AS f_team,
    c.position                         AS f_position,
    c.projection_final::numeric        AS f_projection_final,
    c.ceiling_estimate::numeric        AS f_ceiling_estimate,
    c.floor_estimate::numeric          AS f_floor_estimate,
    c.consistency_score                AS f_consistency_score,
    c.form_rating::numeric             AS f_form_rating,
    c.matchup_rating::numeric          AS f_matchup_rating,
    c.upside_rating::numeric           AS f_upside_rating,
    c.risk_rating::numeric             AS f_risk_rating,
    c.projection_confidence::numeric   AS f_projection_confidence,
    c.captain_score::numeric           AS f_captain_score,
    c.captain_rating                   AS f_captain_rating,
    c.neeko_rating::numeric            AS f_neeko_rating,
    c.price                            AS f_price,
    c.value_score::numeric             AS f_value_score,
    c.value_tag                        AS f_value_tag,
    c.value_tier                       AS f_value_tier,
    c.consistency_tier                 AS f_consistency_tier,
    c.ai_recommendation                AS f_ai_recommendation,
    c.ai_summary                       AS f_ai_summary,
    c.ai_updated_at                    AS f_ai_updated_at,
    c.recommendation_why               AS f_recommendation_why,
    c.recommendation_color             AS f_recommendation_color
  FROM public.v_rankings_canonical c
  WHERE
    v_position_filter IS NULL
    OR v_position_filter = 'ALL'
    OR c.position = v_position_filter
),
sorted AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN v_sort_key = 'value'      THEN f_value_score      END DESC NULLS LAST,
        CASE WHEN v_sort_key = 'projection' THEN f_projection_final  END DESC NULLS LAST,
        CASE WHEN v_sort_key NOT IN ('value','projection') THEN f_neeko_rating END DESC NULLS LAST
    ) AS rn
  FROM filtered
),
counted AS (SELECT count(*)::bigint AS total_count FROM filtered)
SELECT
  s.f_player_id,
  s.f_player_name,
  s.f_team,
  s.f_position,
  s.f_projection_final,
  s.f_ceiling_estimate,
  s.f_floor_estimate,
  s.f_consistency_score,
  s.f_form_rating,
  s.f_matchup_rating,
  s.f_upside_rating,
  s.f_risk_rating,
  s.f_projection_confidence,
  s.f_captain_score,
  s.f_captain_rating,
  s.f_neeko_rating,
  CASE WHEN s.rn <= 5 THEN s.f_price             ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_value_score        ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_value_tag          ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_value_tier         ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_ai_recommendation  ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_ai_summary         ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_ai_updated_at      ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_recommendation_why ELSE NULL END,
  CASE WHEN s.rn <= 5 THEN s.f_recommendation_color ELSE NULL END,
  s.f_consistency_tier,
  c.total_count
FROM sorted s, counted c
ORDER BY s.rn
LIMIT v_limit_n;
END;
$function$;
