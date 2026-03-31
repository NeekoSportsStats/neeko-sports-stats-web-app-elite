
/*
  # Create public.v_rankings_master

  ## Purpose
  Lightweight public view for Start/Sit and selector search.
  Both StartSitPage.tsx and StartSitSelector.tsx query this view directly
  via supabase.from("v_rankings_master").

  ## Key columns
  - Uses ceiling_estimate / floor_estimate aliases (frontend expects these names)
  - player_id returned as integer (frontend stores as string but JS handles cast)
  - Filters to players with a non-null player_id (active roster)
  - Ordered by neeko_rating descending for prefetch relevance

  ## Source
  Points to public.v_rankings_canonical which aliases afl.player_rankings_cache.
  No rankings data is modified.
*/

CREATE OR REPLACE VIEW public.v_rankings_master
WITH (security_invoker = false)
AS
SELECT
  c.player_id::integer             AS player_id,
  c.player_name,
  c.team,
  c.position,
  c.neeko_rating,
  c.projection_final,
  c.ceiling_estimate,
  c.floor_estimate,
  c.projection_confidence,
  c.risk_rating,
  c.captain_score,
  c.captain_rating,
  c.price,
  c.value_score,
  c.value_tag,
  c.value_tier,
  c.upside_rating,
  c.consistency_score,
  c.ai_summary,
  c.recommendation_color,
  c.recommendation_short,
  c.refreshed_at
FROM public.v_rankings_canonical c
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;
