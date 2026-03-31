/*
  # Drop and recreate get_rankings_free with ai_analysis column

  ## Changes
  - Drops existing get_rankings_free function (required to change RETURNS TABLE signature)
  - Recreates with ai_analysis text column added to return type
  - Preserves all existing columns and logic
  - ai_analysis surfaces the recommendation_long text from ai_rankings_player_recos
*/

DROP FUNCTION IF EXISTS public.get_rankings_free(text, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  position_filter text DEFAULT NULL,
  limit_n         int  DEFAULT 20
)
RETURNS TABLE (
  player_id             text,
  player_name           text,
  team                  text,
  "position"            text,
  projection_final      numeric,
  ceiling_estimate      numeric,
  floor_estimate        numeric,
  consistency_score     double precision,
  form_rating           numeric,
  matchup_rating        numeric,
  upside_rating         numeric,
  risk_rating           numeric,
  projection_confidence numeric,
  ai_recommendation     text,
  ai_analysis           text,
  captain_score         numeric,
  captain_rating        text,
  total_count           bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      p.player_id::text,
      p.player_name,
      p.team,
      p."position",
      p.projection_final,
      p.ceiling_estimate,
      p.floor_estimate,
      p.consistency_score,
      p.form_rating,
      p.matchup_rating,
      p.upside_rating,
      p.risk_rating,
      p.projection_confidence,
      p.ai_recommendation,
      p.ai_analysis,
      p.captain_score,
      p.captain_rating
    FROM public.v_rankings_premium p
    WHERE
      position_filter IS NULL
      OR position_filter = 'ALL'
      OR p."position" = position_filter
  ),
  counted AS (
    SELECT COUNT(*) AS total_count FROM base
  )
  SELECT
    b.player_id,
    b.player_name,
    b.team,
    b."position",
    b.projection_final,
    b.ceiling_estimate,
    b.floor_estimate,
    b.consistency_score,
    b.form_rating,
    b.matchup_rating,
    b.upside_rating,
    b.risk_rating,
    b.projection_confidence,
    b.ai_recommendation,
    b.ai_analysis,
    b.captain_score,
    b.captain_rating,
    c.total_count
  FROM base b, counted c
  ORDER BY b.projection_final DESC NULLS LAST
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, integer) TO anon;
