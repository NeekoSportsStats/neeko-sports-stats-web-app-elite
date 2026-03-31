/*
  # Rebuild v_rankings_free — full column set aligned with frontend

  ## Problem
  Frontend FREE_COLUMNS select was returning 400 errors because v_rankings_free
  was missing columns that exist in afl.player_rankings_cache:
    - neeko_rating_scaled
    - recommendation_why
    - ai_summary
    - consistency_tier
    - matchup_multiplier
    - access_tier (free-tier gating label)
    - row_rank (row number for pagination)

  ## Fix
  Drop and recreate public.v_rankings_free sourcing directly from
  afl.player_rankings_cache with every column the frontend requests.
  Missing fields (access_tier, row_rank) are derived inline.

  ## Security
  View uses SECURITY DEFINER owned by postgres so anon/authenticated
  roles can read without needing direct cache table access.
*/

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_free
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team_name,
  c.position,
  c.position_group,

  c.projection_final,
  c.ceiling                                   AS ceiling,
  c.floor                                     AS floor,

  c.consistency                               AS consistency,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.price,
  c.prev_price,
  c.price_change,
  c.price_change_pct,
  c.value_score,
  c.best_value_score,
  c.value_tag,
  c.value_tier,

  c.projection_confidence,
  c.risk_rating,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier,

  c.ai_recommendation,
  c.recommendation_strength,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,

  c.consistency_tier,

  'free'::text                                AS access_tier,

  c.total_count,
  c.cached_at,
  c.games_played,

  ROW_NUMBER() OVER (
    ORDER BY COALESCE(c.neeko_rating_scaled, c.neeko_rating, 0) DESC NULLS LAST
  )::integer                                  AS row_rank,

  c.start_sit_decision,
  c.edge_score,
  c.edge_tier,
  c.market_watch_category,
  c.status,
  c.is_available

FROM afl.player_rankings_cache c
WHERE c.player_name IS NOT NULL
  AND c.player_id IS NOT NULL;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
