/*
  # Drop and Rebuild get_rankings_free and get_rankings_premium

  ## Summary
  Must drop before recreating due to return type change (adding 18 new columns).
  Both functions now read exclusively from afl.player_rankings_cache.

  ## Critical fix:
  get_rankings_premium was hitting afl.v_player_rankings_full on every load.
  This was the cause of the ~38s page load. Now uses cache like get_rankings_free.
*/

DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, integer);
DROP FUNCTION IF EXISTS public.get_rankings_premium(text, text, integer);

CREATE FUNCTION public.get_rankings_free(
  position_filter text DEFAULT 'ALL',
  sort_key        text DEFAULT 'neeko_rating',
  limit_n         integer DEFAULT 750
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  team                  text,
  "position"            text,
  team_name             text,
  position_group        text,
  neeko_rating          double precision,
  projection_final      double precision,
  projection            double precision,
  ceiling               double precision,
  floor                 double precision,
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
SET search_path = public, afl
AS $$
  SELECT
    c.player_id, c.player_name, c.team, c.position, c.team_name, c.position_group,
    c.neeko_rating, c.projection_final, c.projection, c.ceiling, c.floor,
    c.consistency, c.form_score, c.price, c.value_score,
    c.projection_confidence, c.risk_rating, c.matchup_rating, c.upside_rating,
    c.captain_score, c.captain_rating,
    c.ai_recommendation, c.recommendation_why, c.recommendation_short, c.recommendation_color,
    c.ai_summary, c.ai_updated_at,
    c.value_tag, c.value_tier, c.consistency_tier,
    c.total_count
  FROM afl.player_rankings_cache c
  WHERE (position_filter = 'ALL' OR c.position = position_filter)
  ORDER BY
    CASE WHEN sort_key = 'projection_final'      THEN c.projection_final      END DESC NULLS LAST,
    CASE WHEN sort_key = 'value_score'           THEN c.value_score           END DESC NULLS LAST,
    CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence END DESC NULLS LAST,
    CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating           END ASC  NULLS LAST,
    c.neeko_rating DESC NULLS LAST
  LIMIT limit_n;
$$;

CREATE FUNCTION public.get_rankings_premium(
  position_filter text DEFAULT 'ALL',
  sort_key        text DEFAULT 'neeko_rating',
  limit_n         integer DEFAULT 750
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  team                  text,
  "position"            text,
  team_name             text,
  position_group        text,
  neeko_rating          double precision,
  projection_final      double precision,
  projection            double precision,
  ceiling               double precision,
  floor                 double precision,
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
SET search_path = public, afl
AS $$
  SELECT
    c.player_id, c.player_name, c.team, c.position, c.team_name, c.position_group,
    c.neeko_rating, c.projection_final, c.projection, c.ceiling, c.floor,
    c.consistency, c.form_score, c.price, c.value_score,
    c.projection_confidence, c.risk_rating, c.matchup_rating, c.upside_rating,
    c.captain_score, c.captain_rating,
    c.ai_recommendation, c.recommendation_why, c.recommendation_short, c.recommendation_color,
    c.ai_summary, c.ai_updated_at,
    c.value_tag, c.value_tier, c.consistency_tier,
    c.total_count
  FROM afl.player_rankings_cache c
  WHERE (position_filter = 'ALL' OR c.position = position_filter)
  ORDER BY
    CASE WHEN sort_key = 'projection_final'      THEN c.projection_final      END DESC NULLS LAST,
    CASE WHEN sort_key = 'value_score'           THEN c.value_score           END DESC NULLS LAST,
    CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence END DESC NULLS LAST,
    CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating           END ASC  NULLS LAST,
    c.neeko_rating DESC NULLS LAST
  LIMIT limit_n;
$$;
