/*
  # Phase 4 + 9: Drop and recreate public views with correct columns

  Existing v_rankings_free has a different column set — must drop cascade first.
  Also drops and recreates v_rankings_master, v_best_value, v_top_projections
  to add games_played, matchup_label, matchup_multiplier.
*/

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;
DROP VIEW IF EXISTS public.v_best_value CASCADE;
DROP VIEW IF EXISTS public.v_top_projections CASCADE;

-- v_rankings_master: full premium view
CREATE VIEW public.v_rankings_master AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team_name,
  c.position,
  c.position_group,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.consistency,
  c.form_score,
  c.neeko_rating,
  c.best_value_score,
  c.price,
  c.value_score,
  c.value_tag,
  c.value_tier,
  c.signal,
  c.summary,
  c.analysis,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier,
  c.games_played,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,
  c.ai_updated_at,
  c.consistency_tier,
  c.total_count,
  c.cached_at
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO authenticated;
GRANT SELECT ON public.v_rankings_master TO anon;

-- v_best_value: Phase 3 filtered — projection >= 70, games_played >= 3
CREATE VIEW public.v_best_value AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team_name,
  c.position,
  c.position_group,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.consistency,
  c.form_score,
  c.neeko_rating,
  c.best_value_score,
  c.price,
  c.value_score,
  c.value_tag,
  c.value_tier,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier,
  c.games_played,
  c.ai_recommendation,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,
  c.ai_updated_at,
  c.consistency_tier,
  c.total_count,
  c.cached_at
FROM afl.player_rankings_cache c
WHERE c.projection_final >= 70
  AND COALESCE(c.games_played, 0) >= 3
  AND c.price IS NOT NULL
  AND c.price > 0
ORDER BY c.best_value_score DESC NULLS LAST;

GRANT SELECT ON public.v_best_value TO authenticated;
GRANT SELECT ON public.v_best_value TO anon;

-- v_top_projections: sorted by projection descending
CREATE VIEW public.v_top_projections AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team_name,
  c.position,
  c.position_group,
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.consistency,
  c.form_score,
  c.neeko_rating,
  c.best_value_score,
  c.price,
  c.value_score,
  c.value_tag,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier,
  c.games_played,
  c.ai_recommendation,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,
  c.ai_updated_at,
  c.consistency_tier,
  c.total_count,
  c.cached_at
FROM afl.player_rankings_cache c
ORDER BY c.projection_final DESC NULLS LAST;

GRANT SELECT ON public.v_top_projections TO authenticated;
GRANT SELECT ON public.v_top_projections TO anon;

-- Phase 9: v_rankings_free with tiered gating
-- Row 1-5:  full (projection, confidence, form, ceiling/floor, matchup, AI summary_short)
-- Row 6-15: partial (projection, confidence, form — no AI text)
-- Row 16+:  locked (name + position only, all numeric NULL)
-- NEVER exposes: price, value_score, best_value_score, captain data, full AI text
CREATE VIEW public.v_rankings_free AS
WITH ranked AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (ORDER BY c.neeko_rating DESC NULLS LAST) AS row_rank
  FROM afl.player_rankings_cache c
)
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.team_name,
  r.position,
  r.position_group,

  CASE WHEN r.row_rank <= 15 THEN r.projection_final    ELSE NULL END AS projection_final,
  CASE WHEN r.row_rank <= 15 THEN r.projection          ELSE NULL END AS projection,
  CASE WHEN r.row_rank <= 5  THEN r.ceiling             ELSE NULL END AS ceiling,
  CASE WHEN r.row_rank <= 5  THEN r.floor               ELSE NULL END AS floor,
  CASE WHEN r.row_rank <= 15 THEN r.consistency         ELSE NULL END AS consistency,
  CASE WHEN r.row_rank <= 15 THEN r.form_score          ELSE NULL END AS form_score,
  CASE WHEN r.row_rank <= 15 THEN r.neeko_rating        ELSE NULL END AS neeko_rating,

  NULL::integer          AS price,
  NULL::double precision AS value_score,
  NULL::text             AS value_tag,
  NULL::text             AS value_tier,
  NULL::double precision AS best_value_score,

  CASE WHEN r.row_rank <= 15 THEN r.projection_confidence ELSE NULL END AS projection_confidence,
  CASE WHEN r.row_rank <= 5  THEN r.risk_rating           ELSE NULL END AS risk_rating,
  CASE WHEN r.row_rank <= 5  THEN r.matchup_rating        ELSE NULL END AS matchup_rating,
  CASE WHEN r.row_rank <= 5  THEN r.matchup_label         ELSE NULL END AS matchup_label,
  CASE WHEN r.row_rank <= 5  THEN r.matchup_multiplier    ELSE NULL END AS matchup_multiplier,
  CASE WHEN r.row_rank <= 15 THEN r.games_played          ELSE NULL END AS games_played,
  CASE WHEN r.row_rank <= 15 THEN r.ai_recommendation     ELSE NULL END AS ai_recommendation,
  CASE WHEN r.row_rank <= 15 THEN r.recommendation_color  ELSE NULL END AS recommendation_color,
  CASE WHEN r.row_rank <= 5  THEN r.recommendation_short  ELSE NULL END AS recommendation_short,

  NULL::text       AS recommendation_why,
  NULL::text       AS ai_summary,
  NULL::timestamptz AS ai_updated_at,

  CASE WHEN r.row_rank <= 15 THEN r.consistency_tier ELSE NULL END AS consistency_tier,

  CASE
    WHEN r.row_rank <= 5  THEN 'full'
    WHEN r.row_rank <= 15 THEN 'partial'
    ELSE 'locked'
  END AS access_tier,

  r.total_count,
  r.cached_at,
  r.row_rank
FROM ranked r
ORDER BY r.row_rank;

GRANT SELECT ON public.v_rankings_free TO authenticated;
GRANT SELECT ON public.v_rankings_free TO anon;
