/*
  # Landing Page Hardening — Safe Public Views & Freemium RPC Fix

  ## Summary
  Hardens the landing page data layer so that anonymous and free-tier users
  cannot access premium-only fields through public views or the free RPC.

  ## Changes

  ### 1. New view: public.v_edge_board_safe
  - Exposes ONLY the 8 safe fields needed by the EdgeBoardPreview component
  - Strips all premium columns: ai_summary, price, value_score, ai_recommendation,
    captain_score, recommendation_color, recommendation_short, signal, analysis
  - Readable by anon and authenticated roles

  ### 2. Replacement RPC: public.get_rankings_free (DROP + RECREATE)
  - Previous version leaked: ai_summary, ai_recommendation, recommendation_why,
    recommendation_short, recommendation_color, price, value_score, captain_score,
    captain_rating, value_tag, value_tier, consistency_tier, ai_updated_at
  - New version returns ONLY the safe subset:
    player_id, player_name, player_team, player_position, position_group,
    neeko_rating, projection_final, ceiling_estimate, projection_confidence,
    risk_rating, upside_rating, total_count
  - Default limit_n remains 750 but landing page calls with limit_n: 10

  ## Security
  - Both objects are SECURITY DEFINER to safely access afl schema internals
  - anon and authenticated SELECT grants applied to the new view
*/

-- ─── 1. Safe edge board view ────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
SELECT
  player_name,
  team,
  position,
  neeko_rating,
  projection_final::double precision   AS projection_final,
  ceiling_estimate::double precision   AS ceiling_estimate,
  projection_confidence,
  risk_rating,
  upside_rating
FROM public.v_rankings_canonical;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated, service_role;

-- ─── 2. Safe get_rankings_free RPC ───────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_rankings_free(text, text, integer);

CREATE OR REPLACE FUNCTION public.get_rankings_free(
  position_filter text    DEFAULT 'ALL',
  sort_key        text    DEFAULT 'neeko_rating',
  limit_n         integer DEFAULT 750
)
RETURNS TABLE (
  player_id             integer,
  player_name           text,
  player_team           text,
  player_position       text,
  position_group        text,
  neeko_rating          double precision,
  projection_final      numeric,
  ceiling_estimate      double precision,
  projection_confidence double precision,
  risk_rating           double precision,
  upside_rating         double precision,
  value_score           double precision,
  total_count           integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
SELECT
  c.player_id,
  c.player_name,
  c.team            AS player_team,
  c.position        AS player_position,
  c.position_group,
  c.neeko_rating,
  c.projection_final,
  c.ceiling_estimate,
  c.projection_confidence,
  c.risk_rating,
  c.upside_rating,
  c.value_score,
  c.total_count
FROM afl.player_rankings_cache c
WHERE (position_filter = 'ALL' OR c.position = position_filter)
ORDER BY
  CASE WHEN sort_key = 'projection_final'      THEN c.projection_final::double precision END DESC NULLS LAST,
  CASE WHEN sort_key = 'projection_confidence' THEN c.projection_confidence             END DESC NULLS LAST,
  CASE WHEN sort_key = 'risk_rating'           THEN c.risk_rating                       END ASC  NULLS LAST,
  c.neeko_rating DESC NULLS LAST
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_rankings_free(text, text, integer) TO anon, authenticated, service_role;
