/*
  # Create get_rankings_free RPC

  Server-side position filter for free-tier rankings.

  ## Purpose
  Returns the top N rows from v_rankings_premium for a given position filter,
  plus a total_count of all players matching that filter. This ensures free users
  see 20 correct rows per position tab, not a subset of the top-20-overall.

  ## Returns
  - All columns the frontend expects (matches v_rankings_premium shape)
  - total_count: total players in that position (for CTA messaging)

  ## Rules
  - position_filter NULL or 'ALL' → top limit_n overall, total_count = all 594
  - position_filter in ('DEF','MID','FWD','RUC') → top limit_n for that position
  - Ordered by projection_final DESC
*/

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  position_filter text DEFAULT NULL,
  limit_n int DEFAULT 20
)
RETURNS TABLE (
  player_id         text,
  player_name       text,
  team              text,
  "position"        text,
  projection_final  numeric,
  ceiling_estimate  numeric,
  floor_estimate    numeric,
  consistency_score double precision,
  form_rating       numeric,
  matchup_rating    numeric,
  upside_rating     numeric,
  risk_rating       numeric,
  projection_confidence numeric,
  ai_recommendation text,
  captain_score     numeric,
  captain_rating    text,
  total_count       bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      p.player_id,
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
    b.captain_score,
    b.captain_rating,
    c.total_count
  FROM base b, counted c
  ORDER BY b.projection_final DESC NULLS LAST
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, int) TO anon, authenticated;
