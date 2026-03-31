/*
  # Rebuild v_rankings_canonical — prefer ai_rankings_player_recos.recommendation_long as ai_summary

  ## Problem
  v_rankings_canonical joined afl.ai_player_summaries by player_name (string match) and never
  touched public.ai_rankings_player_recos even though it contains 594 rows of purpose-built
  ranking AI analysis (recommendation_long) joined by reliable player_id integer FK.

  ## Change
  - Add LEFT JOIN to public.ai_rankings_player_recos a ON a.player_id = r.player_id AND a.season = 2026
  - ai_summary COALESCE: recommendation_long (new, rich) → afl.ai_player_summaries.ai_summary (fallback) → r.ai_analysis (last resort)
  - recommendation_color COALESCE: recos table → existing value
  - ai_updated_at: GREATEST of both sources
  - All 28 column names and order preserved exactly to avoid view rename errors

  ## No schema changes — view definition only.
*/

DROP VIEW IF EXISTS public.v_rankings_canonical CASCADE;

CREATE VIEW public.v_rankings_canonical AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r."position",
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.captain_score,
  r.captain_rating,
  r.neeko_rating,
  r.price,
  r.value_score,
  r.value_tier,
  r.value_tag,
  r.price_tier,
  r.consistency_tier,
  r.ai_recommendation,
  r.recommendation_why,
  COALESCE(a.recommendation_color, r.recommendation_color) AS recommendation_color,
  COALESCE(a.recommendation_long, s.ai_summary, r.ai_analysis) AS ai_summary,
  GREATEST(a.generated_at, s.updated_at) AS ai_updated_at,
  r.data_updated_at
FROM v_rankings_with_value r
LEFT JOIN public.ai_rankings_player_recos a
  ON a.player_id = r.player_id
  AND a.season = 2026
LEFT JOIN afl.ai_player_summaries s
  ON s.player = r.player_name;
