/*
  # Fix 05: Create public.v_rankings_free

  ## Problem
  The frontend queries public.v_rankings_free for unauthenticated / free-tier users
  on the /sports/afl/rankings page. This view does not exist anywhere, causing
  free user rankings to return an error.

  ## Solution
  Create public.v_rankings_free as a view over afl.player_rankings_cache that:
  - Returns the same column aliases the frontend expects
  - Includes ALL columns the Rankings page requests
  - No row limit (frontend applies its own limit)

  ## Column mapping
  The frontend (AFLRankingsPage.tsx) requests these exact column names:
    player_id, player_name, team, position, team_name, position_group,
    projection_final, ceiling, floor, ceiling_estimate, floor_estimate,
    consistency_score, form_rating, neeko_rating, price, value_score,
    value_tag, value_tier, signal, summary, analysis, projection_confidence,
    risk_rating, matchup_rating, upside_rating, captain_score, captain_rating,
    consistency_tier, total_count, cached_at

  ## Security
  View is security_invoker = false so anon can read without direct cache access.
*/

CREATE OR REPLACE VIEW public.v_rankings_free
WITH (security_invoker = false)
AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  COALESCE(r.team_name, r.team)                    AS team_name,
  COALESCE(r.position_group, r.position)           AS position_group,
  r.projection_final,
  r.ceiling                                        AS ceiling,
  r.floor                                          AS floor,
  r.ceiling                                        AS ceiling_estimate,
  r.floor                                          AS floor_estimate,
  r.consistency                                    AS consistency_score,
  r.form_score                                     AS form_rating,
  r.neeko_rating,
  r.price,
  r.value_score,
  r.value_tag,
  r.value_tier,
  r.recommendation_short                           AS signal,
  r.ai_summary                                     AS summary,
  r.recommendation_why                             AS analysis,
  r.projection_confidence,
  r.risk_rating,
  r.matchup_rating,
  r.upside_rating,
  r.captain_score,
  r.captain_rating,
  r.consistency_tier,
  r.total_count,
  r.cached_at
FROM afl.player_rankings_cache r
WHERE r.player_id IS NOT NULL;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;

COMMENT ON VIEW public.v_rankings_free IS
  'Free-tier rankings view served to unauthenticated and free users. Backed by afl.player_rankings_cache. Column names match what AFLRankingsPage.tsx expects.';
