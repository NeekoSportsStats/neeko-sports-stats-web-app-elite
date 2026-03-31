
/*
  # Create public.v_rankings_canonical

  ## Purpose
  Provides a safe, stable public-schema alias over afl.player_rankings_cache.
  Multiple downstream modules (Edge Board, Start/Sit, Market Watch) expect a
  public-schema view with standard column names. This is a READ-ONLY alias —
  it does not modify any rankings data.

  ## Column aliases
  - ceiling  → ceiling_estimate  (frontend expects this name)
  - floor    → floor_estimate    (frontend expects this name)
  - consistency → consistency_score (common alias expected by consumers)

  ## Security
  - SECURITY DEFINER so anon role can read through it
  - No RLS needed (view handles access via definer)
*/

CREATE OR REPLACE VIEW public.v_rankings_canonical
WITH (security_invoker = false)
AS
SELECT
  c.player_id::text                AS player_id,
  c.player_name,
  c.team,
  c.position,
  c.team_name,
  c.position_group,
  c.neeko_rating,
  c.projection_final,
  c.projection,
  c.ceiling                        AS ceiling_estimate,
  c.floor                          AS floor_estimate,
  c.ceiling,
  c.floor,
  c.consistency                    AS consistency_score,
  c.consistency,
  c.form_score,
  c.price,
  c.value_score,
  c.value_tag,
  c.value_tier,
  c.upside_rating,
  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_why,
  c.recommendation_short,
  c.recommendation_color,
  c.ai_summary,
  c.ai_updated_at,
  c.consistency_tier,
  c.total_count,
  c.cached_at                      AS refreshed_at
FROM afl.player_rankings_cache c;

GRANT SELECT ON public.v_rankings_canonical TO anon, authenticated;
