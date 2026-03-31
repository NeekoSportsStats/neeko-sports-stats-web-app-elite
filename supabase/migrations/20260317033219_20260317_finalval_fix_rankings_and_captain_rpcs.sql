/*
  # Fix get_rankings_free / get_rankings_premium / get_captain_recommendations_free RPCs

  ## Problem
  - get_rankings_free and get_rankings_premium referenced non-existent `ai_player_content` table
  - get_captain_recommendations_free referenced non-existent public.v_rankings_master
  - All AI content is already in afl.player_rankings_cache

  ## Fix
  Rebuild all three RPCs to read directly from afl.player_rankings_cache with correct types.
*/

DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, integer);
DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);
DROP FUNCTION IF EXISTS public.get_captain_recommendations_free();

-- 1. get_rankings_free
CREATE OR REPLACE FUNCTION public.get_rankings_free(
  position_filter text    DEFAULT 'ALL',
  sort_key        text    DEFAULT 'neeko_rating',
  limit_n         integer DEFAULT 750
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  player_team           text,
  player_position       text,
  position_group        text,
  neeko_rating          double precision,
  projection_final      numeric,
  projection            double precision,
  ceiling               double precision,
  floor                 double precision,
  ceiling_estimate      double precision,
  consistency           double precision,
  form_score            double precision,
  price                 integer,
  value_score           double precision,
  projection_confidence double precision,
  risk_rating           double precision,
  matchup_rating        text,
  upside_rating         double precision,
  captain_score         double precision,
  captain_rating        text,
  ai_recommendation     text,
  recommendation_why    text,
  recommendation_short  text,
  recommendation_color  text,
  ai_summary            text,
  ai_updated_at         timestamptz,
  value_tag             text,
  value_tier            text,
  consistency_tier      text,
  total_count           integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
SELECT
  c.player_id,
  c.player_name,
  c.team            AS player_team,
  c.position        AS player_position,
  c.position_group,
  c.neeko_rating,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.ceiling_estimate,
  c.consistency,
  c.form_score,
  c.price,
  c.value_score,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_why,
  c.recommendation_short,
  c.recommendation_color,
  c.ai_summary,
  c.ai_updated_at,
  c.value_tag,
  c.value_tier,
  c.consistency_tier,
  c.total_count
FROM afl.player_rankings_cache c
WHERE (position_filter = 'ALL' OR c.position = position_filter)
ORDER BY
  CASE WHEN sort_key = 'projection_final'      THEN c.projection_final::double precision END DESC NULLS LAST,
  CASE WHEN sort_key = 'value_score'           THEN c.value_score           END DESC NULLS LAST,
  CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence END DESC NULLS LAST,
  CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating           END ASC  NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, text, integer) TO anon, authenticated, service_role;

-- 2. get_rankings_premium (same structure — premium tier uses same cache)
CREATE OR REPLACE FUNCTION public.get_rankings_premium(
  position_filter text    DEFAULT 'ALL',
  sort_key        text    DEFAULT 'neeko_rating',
  limit_n         integer DEFAULT 750
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  player_team           text,
  player_position       text,
  position_group        text,
  neeko_rating          double precision,
  projection_final      numeric,
  projection            double precision,
  ceiling               double precision,
  floor                 double precision,
  ceiling_estimate      double precision,
  consistency           double precision,
  form_score            double precision,
  price                 integer,
  value_score           double precision,
  projection_confidence double precision,
  risk_rating           double precision,
  matchup_rating        text,
  upside_rating         double precision,
  captain_score         double precision,
  captain_rating        text,
  ai_recommendation     text,
  recommendation_why    text,
  recommendation_short  text,
  recommendation_color  text,
  ai_summary            text,
  ai_updated_at         timestamptz,
  value_tag             text,
  value_tier            text,
  consistency_tier      text,
  total_count           integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
SELECT
  c.player_id,
  c.player_name,
  c.team            AS player_team,
  c.position        AS player_position,
  c.position_group,
  c.neeko_rating,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.ceiling_estimate,
  c.consistency,
  c.form_score,
  c.price,
  c.value_score,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_why,
  c.recommendation_short,
  c.recommendation_color,
  c.ai_summary,
  c.ai_updated_at,
  c.value_tag,
  c.value_tier,
  c.consistency_tier,
  c.total_count
FROM afl.player_rankings_cache c
WHERE (position_filter = 'ALL' OR c.position = position_filter)
ORDER BY
  CASE WHEN sort_key = 'projection_final'      THEN c.projection_final::double precision END DESC NULLS LAST,
  CASE WHEN sort_key = 'value_score'           THEN c.value_score           END DESC NULLS LAST,
  CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence END DESC NULLS LAST,
  CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating           END ASC  NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_premium(text, text, integer) TO anon, authenticated, service_role;

-- 3. get_captain_recommendations_free
CREATE OR REPLACE FUNCTION public.get_captain_recommendations_free()
RETURNS TABLE (
  player_id          integer,
  player_name        text,
  player_team        text,
  projection_final   numeric,
  ceiling_estimate   double precision,
  consistency_score  double precision,
  captain_score      double precision,
  captain_rating     text,
  captain_confidence integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
SELECT
  player_id,
  player_name,
  team AS player_team,
  projection_final,
  ceiling_estimate,
  consistency AS consistency_score,
  captain_score,
  captain_rating,
  CASE (ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST))::int
    WHEN 1 THEN 99
    WHEN 2 THEN 97
    ELSE 94
  END AS captain_confidence
FROM afl.player_rankings_cache
WHERE captain_score IS NOT NULL
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.get_captain_recommendations_free() TO anon, authenticated, service_role;
