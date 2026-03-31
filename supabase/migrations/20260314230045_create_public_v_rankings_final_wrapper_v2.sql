
/*
  # Create public.v_rankings_final — PostgREST-accessible rankings view (v2)

  ## Problem
  afl.v_rankings_final exists only in the afl schema — not reachable via PostgREST REST.
  The frontend's .from("afl.v_rankings_final") fails silently, returning no rows.

  ## Fix
  Create public.v_rankings_final backed by public.v_player_rankings_full (736 rows).
  Expose all RankingRow fields. Map recommendation → ai_recommendation,
  derive recommendation_color from recommendation text.

  ## Security
  - SELECT granted to anon and authenticated
*/

CREATE OR REPLACE VIEW public.v_rankings_final AS
SELECT
  player_id,
  player_name,
  team,
  position,
  team_name,
  position_group,

  projection_final,
  ceiling,
  floor,
  ceiling                 AS ceiling_estimate,
  floor                   AS floor_estimate,

  consistency_score,
  form_rating,

  neeko_rating,
  price,
  value_score,
  value_tag,
  value_tier,

  recommendation          AS ai_recommendation,
  recommendation_short,
  recommendation_short    AS recommendation_why,
  CASE
    WHEN recommendation = 'BUY'   THEN 'green'
    WHEN recommendation = 'SELL'  THEN 'red'
    WHEN recommendation = 'SIT'   THEN 'yellow'
    WHEN recommendation = 'HOLD'  THEN 'grey'
    ELSE 'grey'
  END                     AS recommendation_color,

  ai_summary,
  ai_updated_at,

  projection_confidence,
  risk_rating,
  matchup_rating,
  upside_rating,
  captain_score,
  captain_rating,
  consistency_tier,
  total_count

FROM public.v_player_rankings_full;

GRANT SELECT ON public.v_rankings_final TO anon, authenticated;
