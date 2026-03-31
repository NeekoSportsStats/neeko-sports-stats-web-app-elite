/*
  # Fix get_rankings_premium and get_rankings_free — add best_value_score

  ## Problem
  - get_rankings_premium does not return best_value_score
  - "Best Value" tab sort falls through to neeko_rating

  ## Fix
  - Drop and recreate both RPCs with best_value_score in return set
  - Add 'best_value_score' to ORDER BY CASE
  - Preserve all existing columns

  ## Safe: functions only, no table/view changes
*/

DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);
DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, integer);

CREATE FUNCTION public.get_rankings_premium(
    position_filter text DEFAULT 'ALL'::text,
    sort_key        text DEFAULT 'neeko_rating'::text,
    limit_n         integer DEFAULT 750
)
RETURNS TABLE(
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
    best_value_score      double precision,
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
    ai_updated_at         timestamp with time zone,
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
  c.best_value_score,
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
  CASE WHEN sort_key = 'projection_final'      THEN c.projection_final::double precision      END DESC NULLS LAST,
  CASE WHEN sort_key = 'value_score'           THEN c.value_score                             END DESC NULLS LAST,
  CASE WHEN sort_key = 'best_value_score'      THEN c.best_value_score                        END DESC NULLS LAST,
  CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence                   END DESC NULLS LAST,
  CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating                             END ASC  NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT limit_n;
$$;

CREATE FUNCTION public.get_rankings_free(
    position_filter text DEFAULT 'ALL'::text,
    sort_key        text DEFAULT 'neeko_rating'::text,
    limit_n         integer DEFAULT 750
)
RETURNS TABLE(
    player_id             integer,
    player_name           text,
    player_team           text,
    player_position       text,
    position_group        text,
    neeko_rating          double precision,
    projection_final      numeric,
    ceiling_estimate      double precision,
    projection_confidence double precision,
    risk_rating           double precision,
    upside_rating         double precision,
    value_score           double precision,
    best_value_score      double precision,
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
  c.ceiling_estimate,
  c.projection_confidence,
  c.risk_rating,
  c.upside_rating,
  c.value_score,
  c.best_value_score,
  c.total_count
FROM afl.player_rankings_cache c
WHERE (position_filter = 'ALL' OR c.position = position_filter)
ORDER BY
  CASE WHEN sort_key = 'projection_final'      THEN c.projection_final::double precision      END DESC NULLS LAST,
  CASE WHEN sort_key = 'best_value_score'      THEN c.best_value_score                        END DESC NULLS LAST,
  CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence                   END DESC NULLS LAST,
  CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating                             END ASC  NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_premium(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, text, integer) TO anon, authenticated;
