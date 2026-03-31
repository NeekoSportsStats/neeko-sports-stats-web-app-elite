/*
  # Fix RPC type mismatch — double precision → numeric casts

  ## Problem
  get_rankings_free() and get_rankings_premium() declare return columns as NUMERIC
  but public.v_rankings_canonical now returns some columns as DOUBLE PRECISION
  (consistency_score, form_rating, matchup_rating, upside_rating, risk_rating,
  projection_confidence, captain_score, neeko_rating, projection_final,
  ceiling_estimate, floor_estimate, value_score).

  This causes ERROR 42804 on every call, breaking the Rankings page.

  ## Fix
  Cast all affected numeric columns to ::numeric in the filtered CTE of both RPCs.
  No signature changes, no column order changes, no business logic changes.
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
BEGIN
RETURN QUERY
WITH filtered AS (
SELECT
c.player_id::text,
c.player_name,
c.team,
c.position,
c.projection_final::numeric,
c.ceiling_estimate::numeric,
c.floor_estimate::numeric,
c.consistency_score,
c.form_rating::numeric,
c.matchup_rating::numeric,
c.upside_rating::numeric,
c.risk_rating::numeric,
c.projection_confidence::numeric,
c.captain_score::numeric,
c.captain_rating,
c.neeko_rating::numeric,
c.price,
c.value_score::numeric,
c.value_tag,
c.value_tier,
c.consistency_tier,
c.ai_recommendation,
c.ai_summary,
c.ai_updated_at,
c.recommendation_why,
c.recommendation_color
FROM public.v_rankings_canonical c
WHERE
position_filter IS NULL
OR position_filter = 'ALL'
OR c.position = position_filter
),
sorted AS (
SELECT *,
ROW_NUMBER() OVER (
ORDER BY
CASE WHEN sort_key = 'value'      THEN value_score     END DESC NULLS LAST,
CASE WHEN sort_key = 'projection' THEN projection_final END DESC NULLS LAST,
CASE WHEN sort_key NOT IN ('value','projection') THEN neeko_rating END DESC NULLS LAST
) AS rn
FROM filtered
),
counted AS (SELECT count(*)::bigint AS total_count FROM filtered)
SELECT
s.player_id,
s.player_name,
s.team,
s.position,
s.projection_final,
s.ceiling_estimate,
s.floor_estimate,
s.consistency_score,
s.form_rating,
s.matchup_rating,
s.upside_rating,
s.risk_rating,
s.projection_confidence,
s.captain_score,
s.captain_rating,
s.neeko_rating,
CASE WHEN s.rn <= 5 THEN s.price             ELSE NULL END AS price,
CASE WHEN s.rn <= 5 THEN s.value_score        ELSE NULL END AS value_score,
CASE WHEN s.rn <= 5 THEN s.value_tag          ELSE NULL END AS value_tag,
CASE WHEN s.rn <= 5 THEN s.value_tier         ELSE NULL END AS value_tier,
CASE WHEN s.rn <= 5 THEN s.ai_recommendation  ELSE NULL END AS ai_recommendation,
CASE WHEN s.rn <= 5 THEN s.ai_summary         ELSE NULL END AS ai_summary,
CASE WHEN s.rn <= 5 THEN s.ai_updated_at      ELSE NULL END AS ai_updated_at,
CASE WHEN s.rn <= 5 THEN s.recommendation_why ELSE NULL END AS recommendation_why,
CASE WHEN s.rn <= 5 THEN s.recommendation_color ELSE NULL END AS recommendation_color,
s.consistency_tier,
c.total_count
FROM sorted s, counted c
ORDER BY s.rn
LIMIT limit_n;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  position_filter text DEFAULT 'ALL',
  sort_key text DEFAULT 'neeko_rating',
  limit_n integer DEFAULT 1000
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
BEGIN
RETURN QUERY
WITH filtered AS (
SELECT
c.player_id::text,
c.player_name,
c.team,
c.position,
c.projection_final::numeric,
c.ceiling_estimate::numeric,
c.floor_estimate::numeric,
c.consistency_score,
c.form_rating::numeric,
c.matchup_rating::numeric,
c.upside_rating::numeric,
c.risk_rating::numeric,
c.projection_confidence::numeric,
c.captain_score::numeric,
c.captain_rating,
c.neeko_rating::numeric,
c.price,
c.value_score::numeric,
c.value_tag,
c.value_tier,
c.consistency_tier,
c.ai_recommendation,
c.ai_summary,
c.ai_updated_at,
c.recommendation_why,
c.recommendation_color
FROM public.v_rankings_canonical c
WHERE
position_filter IS NULL
OR position_filter = 'ALL'
OR c.position = position_filter
),
counted AS (SELECT count(*)::bigint AS total_count FROM filtered)
SELECT
t.player_id,
t.player_name,
t.team,
t.position,
t.projection_final,
t.ceiling_estimate,
t.floor_estimate,
t.consistency_score,
t.form_rating,
t.matchup_rating,
t.upside_rating,
t.risk_rating,
t.projection_confidence,
t.captain_score,
t.captain_rating,
t.neeko_rating,
t.price,
t.value_score,
t.value_tag,
t.value_tier,
t.ai_recommendation,
t.ai_summary,
t.ai_updated_at,
t.recommendation_why,
t.recommendation_color,
t.consistency_tier,
c.total_count
FROM filtered t, counted c
ORDER BY
CASE WHEN sort_key = 'value'      THEN t.value_score     END DESC NULLS LAST,
CASE WHEN sort_key = 'projection' THEN t.projection_final END DESC NULLS LAST,
CASE WHEN sort_key NOT IN ('value','projection') THEN t.neeko_rating END DESC NULLS LAST
LIMIT limit_n;
END;
$function$;
