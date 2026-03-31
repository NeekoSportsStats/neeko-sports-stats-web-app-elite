/*
  # Rebuild v_rankings_premium with ai_analysis column

  ## Changes
  - Drops and recreates v_rankings_premium
  - Adds ai_analysis (recommendation_long from ai_rankings_player_recos) for overlay display
  - ai_recommendation now sourced from recommendation_label (was NULL before)
  - Column order preserved: existing columns first, ai_analysis added after ai_recommendation
  - All other columns identical to previous definition

  ## Safety
  - Uses DROP IF EXISTS + immediate CREATE so no window of missing view
  - LEFT JOIN ensures NULL-safe when no AI row exists yet
*/

DROP VIEW IF EXISTS public.v_rankings_premium CASCADE;

CREATE VIEW public.v_rankings_premium AS
WITH latest_recos AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    recommendation_label,
    recommendation_long
  FROM public.ai_rankings_player_recos
  WHERE season = 2026
  ORDER BY player_id, generated_at DESC
)
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
  (CASE
    WHEN proj.trend_3_vs_10 >= 15  THEN 90
    WHEN proj.trend_3_vs_10 >= 8   THEN 80
    WHEN proj.trend_3_vs_10 >= 3   THEN 70
    WHEN proj.trend_3_vs_10 >= -3  THEN 60
    WHEN proj.trend_3_vs_10 >= -10 THEN 45
    ELSE 30
  END)::numeric AS form_rating,
  (CASE
    WHEN proj.matchup_delta >= 10 THEN 90
    WHEN proj.matchup_delta >= 5  THEN 80
    WHEN proj.matchup_delta >= 0  THEN 65
    WHEN proj.matchup_delta >= -5 THEN 50
    ELSE 35
  END)::numeric AS matchup_rating,
  CASE
    WHEN proj.projection_final > 0
    THEN round(((proj.ceiling_estimate - proj.projection_final) / proj.projection_final) * 100)
    ELSE NULL
  END AS upside_rating,
  CASE
    WHEN proj.projection_final > 0
    THEN round(((proj.projection_final - proj.floor_estimate) / proj.projection_final) * 100)
    ELSE NULL
  END AS risk_rating,
  round(proj.consistency_score) AS projection_confidence,
  COALESCE(lr.recommendation_label, NULL) AS ai_recommendation,
  COALESCE(lr.recommendation_long, NULL)  AS ai_analysis,
  round((
    (COALESCE(proj.projection_final, 0)             * 0.45) +
    (COALESCE(proj.ceiling_estimate, 0)             * 0.25) +
    (COALESCE(proj.consistency_score::numeric, 0)   * 0.20) +
    (GREATEST(COALESCE(proj.matchup_delta, 0), 0)   * 1.5)  +
    (GREATEST(COALESCE(proj.trend_3_vs_10, 0), 0)   * 0.8)
  ), 1) AS captain_score,
  CASE
    WHEN proj.projection_final >= 115 AND proj.consistency_score >= 70 THEN 'Elite Captain'
    WHEN proj.projection_final >= 105 AND proj.consistency_score >= 60 THEN 'Strong Captain'
    WHEN proj.projection_final >= 95                                    THEN 'Captain Option'
    ELSE 'Risky Captain'
  END AS captain_rating
FROM v_player_detail_premium proj
LEFT JOIN afl.players_canonical pc
  ON  pc.player_name = proj.player_name
  AND pc.team        = proj.team
  AND pc.season      = 2026
LEFT JOIN latest_recos lr
  ON lr.player_id = proj.player_id;

GRANT SELECT ON public.v_rankings_premium TO authenticated, anon;
