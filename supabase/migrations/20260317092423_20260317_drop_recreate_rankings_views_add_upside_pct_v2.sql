/*
  # Drop and Recreate Public Rankings Views with upside_pct (v2)

  ## Summary
  Adds the `upside_pct` column to v_rankings_master and v_rankings_free by dropping
  and recreating both views. v2 fixes type cast for upside_rating (double precision, not text).

  ## Changes
  - v_rankings_master: adds upside_pct after upside_rating
  - v_rankings_free: adds upside_pct (gated to row_rank <= 5 for free users)
*/

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  consistency,
  form_score,
  neeko_rating,
  neeko_rating_raw,
  neeko_rating_scaled,
  best_value_score,
  price,
  value_score,
  value_tag,
  value_tier,
  projection_confidence,
  risk_rating,
  matchup_rating,
  matchup_label,
  matchup_multiplier,
  games_played,
  upside_rating,
  upside_pct,
  captain_score,
  captain_rating,
  ai_recommendation,
  recommendation_color,
  recommendation_short,
  recommendation_why,
  ai_summary,
  ai_updated_at,
  consistency_tier,
  total_count,
  cached_at
FROM afl.player_rankings_cache
ORDER BY neeko_rating_scaled DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO authenticated;

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_free
WITH (security_invoker = false)
AS
WITH ranked AS (
  SELECT
    c.player_id,
    c.player_name,
    c.team,
    c.team_name,
    c."position",
    c.position_group,
    c.projection_final,
    c.projection,
    c.ceiling,
    c.floor,
    c.consistency,
    c.form_score,
    c.neeko_rating,
    c.neeko_rating_scaled,
    c.price,
    c.value_score,
    c.value_tag,
    c.value_tier,
    c.best_value_score,
    c.projection_confidence,
    c.risk_rating,
    c.matchup_rating,
    c.matchup_label,
    c.matchup_multiplier,
    c.games_played,
    c.upside_rating,
    c.upside_pct,
    c.ai_recommendation,
    c.recommendation_color,
    c.recommendation_short,
    c.recommendation_why,
    c.ai_summary,
    c.ai_updated_at,
    c.consistency_tier,
    c.total_count,
    c.cached_at,
    row_number() OVER (ORDER BY c.neeko_rating_scaled DESC NULLS LAST) AS row_rank
  FROM afl.player_rankings_cache c
)
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  CASE WHEN row_rank <= 15 THEN projection_final ELSE NULL::numeric END AS projection_final,
  CASE WHEN row_rank <= 15 THEN projection ELSE NULL::double precision END AS projection,
  CASE WHEN row_rank <= 5 THEN ceiling ELSE NULL::double precision END AS ceiling,
  CASE WHEN row_rank <= 5 THEN floor ELSE NULL::double precision END AS floor,
  CASE WHEN row_rank <= 15 THEN consistency ELSE NULL::double precision END AS consistency,
  CASE WHEN row_rank <= 15 THEN form_score ELSE NULL::double precision END AS form_score,
  CASE WHEN row_rank <= 15 THEN neeko_rating ELSE NULL::double precision END AS neeko_rating,
  CASE WHEN row_rank <= 15 THEN neeko_rating_scaled ELSE NULL::double precision END AS neeko_rating_scaled,
  price,
  value_score,
  value_tag,
  value_tier,
  best_value_score,
  CASE WHEN row_rank <= 15 THEN projection_confidence ELSE NULL::double precision END AS projection_confidence,
  CASE WHEN row_rank <= 5 THEN risk_rating ELSE NULL::double precision END AS risk_rating,
  CASE WHEN row_rank <= 5 THEN matchup_rating ELSE NULL::text END AS matchup_rating,
  CASE WHEN row_rank <= 5 THEN matchup_label ELSE NULL::text END AS matchup_label,
  CASE WHEN row_rank <= 5 THEN matchup_multiplier ELSE NULL::numeric END AS matchup_multiplier,
  CASE WHEN row_rank <= 15 THEN games_played ELSE NULL::integer END AS games_played,
  CASE WHEN row_rank <= 5 THEN upside_rating ELSE NULL::double precision END AS upside_rating,
  CASE WHEN row_rank <= 5 THEN upside_pct ELSE NULL::double precision END AS upside_pct,
  CASE WHEN row_rank <= 15 THEN ai_recommendation ELSE NULL::text END AS ai_recommendation,
  CASE WHEN row_rank <= 15 THEN recommendation_color ELSE NULL::text END AS recommendation_color,
  CASE WHEN row_rank <= 5 THEN recommendation_short ELSE NULL::text END AS recommendation_short,
  NULL::text AS recommendation_why,
  NULL::text AS ai_summary,
  NULL::timestamp with time zone AS ai_updated_at,
  CASE WHEN row_rank <= 15 THEN consistency_tier ELSE NULL::text END AS consistency_tier,
  CASE
    WHEN row_rank <= 5 THEN 'full'
    WHEN row_rank <= 15 THEN 'partial'
    ELSE 'locked'
  END AS access_tier,
  total_count,
  cached_at,
  row_rank
FROM ranked
ORDER BY row_rank;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
