/*
  # Add recommendation_short to Rankings Views and RPC (cascade rebuild)

  ## Summary
  Surface the one-sentence AI reasoning (recommendation_short) through the
  rankings pipeline so the frontend "Why" column can display it.

  ## Changes
  1. Drop views cascade (captain recommendations depends on rankings master)
  2. Recreate v_rankings_premium with recommendation_why column
  3. Recreate v_rankings_master with recommendation_why pass-through
  4. Recreate v_captain_recommendations (percentile-based confidence, unchanged logic)
  5. Rebuild get_rankings_free() RPC to include recommendation_why
*/

-- Drop cascade to clear dependent views
DROP VIEW IF EXISTS public.v_captain_recommendations CASCADE;
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;
DROP VIEW IF EXISTS public.v_rankings_premium CASCADE;

-- ─── 1. v_rankings_premium ───────────────────────────────────────────────────

CREATE VIEW public.v_rankings_premium AS
SELECT
  proj.player_id,
  proj.player_name,
  proj.team,
  CASE
    WHEN pc."position" ILIKE '%defender%' THEN 'DEF'
    WHEN pc."position" ILIKE '%forward%'  THEN 'FWD'
    WHEN pc."position" ILIKE '%mid%'      THEN 'MID'
    WHEN pc."position" ILIKE '%ruck%'     THEN 'RUC'
    ELSE 'MID'
  END AS "position",
  proj.projection_final,
  proj.ceiling_estimate,
  proj.floor_estimate,
  proj.consistency_score,
  CASE
    WHEN proj.trend_3_vs_10 >= 15  THEN 90
    WHEN proj.trend_3_vs_10 >= 8   THEN 80
    WHEN proj.trend_3_vs_10 >= 3   THEN 70
    WHEN proj.trend_3_vs_10 >= -3  THEN 60
    WHEN proj.trend_3_vs_10 >= -10 THEN 45
    ELSE 30
  END::numeric AS form_rating,
  CASE
    WHEN proj.matchup_delta >= 10 THEN 90
    WHEN proj.matchup_delta >= 5  THEN 80
    WHEN proj.matchup_delta >= 0  THEN 65
    WHEN proj.matchup_delta >= -5 THEN 50
    ELSE 35
  END::numeric AS matchup_rating,
  CASE
    WHEN proj.projection_final > 0
      THEN ROUND((proj.ceiling_estimate - proj.projection_final) / proj.projection_final * 100)
    ELSE NULL
  END AS upside_rating,
  CASE
    WHEN proj.projection_final > 0
      THEN ROUND((proj.projection_final - proj.floor_estimate) / proj.projection_final * 100)
    ELSE NULL
  END AS risk_rating,
  ROUND(proj.consistency_score) AS projection_confidence,
  lr.recommendation_label  AS ai_recommendation,
  lr.recommendation_long   AS ai_analysis,
  lr.recommendation_short  AS recommendation_why,
  lr.recommendation_color,
  ROUND(
    COALESCE(proj.projection_final,           0) * 0.45 +
    COALESCE(proj.ceiling_estimate,           0) * 0.25 +
    COALESCE(proj.consistency_score::numeric, 0) * 0.20 +
    GREATEST(COALESCE(proj.matchup_delta,     0), 0) * 1.5 +
    GREATEST(COALESCE(proj.trend_3_vs_10,     0), 0) * 0.8
  , 1) AS captain_score,
  CASE
    WHEN proj.projection_final >= 115 AND proj.consistency_score >= 70 THEN 'Elite Captain'
    WHEN proj.projection_final >= 105 AND proj.consistency_score >= 60 THEN 'Strong Captain'
    WHEN proj.projection_final >= 95                                   THEN 'Captain Option'
    ELSE 'Risky Captain'
  END AS captain_rating
FROM v_player_detail_premium proj
LEFT JOIN afl.players_canonical pc
  ON pc.player_name = proj.player_name
 AND pc.team        = proj.team
 AND pc.season      = 2026
LEFT JOIN ai_rankings_player_recos lr
  ON lr.player_id = proj.player_id;

-- ─── 2. v_rankings_master ────────────────────────────────────────────────────

CREATE VIEW public.v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  "position",
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  ai_analysis,
  recommendation_why,
  recommendation_color,
  captain_score,
  captain_rating
FROM v_rankings_premium
ORDER BY projection_final DESC NULLS LAST;

-- ─── 3. v_captain_recommendations (percentile confidence, unchanged logic) ───

CREATE VIEW public.v_captain_recommendations AS
WITH ranked AS (
  SELECT
    player_id,
    player_name,
    team,
    projection_final,
    ceiling_estimate,
    consistency_score,
    captain_score,
    captain_rating,
    ROUND(
      (percent_rank() OVER (ORDER BY captain_score) * 100)::numeric
    , 0) AS captain_confidence
  FROM public.v_rankings_master
  WHERE captain_score IS NOT NULL
)
SELECT *
FROM ranked
ORDER BY captain_score DESC
LIMIT 5;

-- ─── 4. Rebuild get_rankings_free() RPC ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_rankings_free(text, integer);

CREATE FUNCTION public.get_rankings_free(
  position_filter text    DEFAULT NULL,
  limit_n         integer DEFAULT 20
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
  recommendation_why    text,
  recommendation_color  text,
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
    p.recommendation_why,
    p.recommendation_color,
    p.captain_score,
    p.captain_rating
  FROM public.v_rankings_premium p
  WHERE
    position_filter IS NULL
    OR position_filter = 'ALL'
    OR p."position" = position_filter
),
counted AS (SELECT COUNT(*) AS total_count FROM base)
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
  b.recommendation_why,
  b.recommendation_color,
  b.captain_score,
  b.captain_rating,
  c.total_count
FROM base b, counted c
ORDER BY b.projection_final DESC NULLS LAST
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, integer)
  TO anon, authenticated;
