/*
  # Create v_ai_rankings_generation_queue — 3-Day Stale Overwrite Logic

  ## Summary
  Creates the `public.v_ai_rankings_generation_queue` view that the
  `generate-player-ranking-recos` edge function queries to determine
  which players need AI recommendation regeneration.

  ## Logic
  - Selects all players from v_rankings_canonical (active ranked players)
  - LEFT JOINs ai_rankings_player_recos to check staleness
  - Includes a player if:
      • No existing reco row (updated_at IS NULL)
      • OR existing row is older than 3 days
  - Orders by updated_at NULLS FIRST so fresh inserts happen before refreshes

  ## Columns exposed (matches edge function expectations)
  - player_id         — bigint PK of the player
  - player_name       — display name
  - team              — current team
  - position          — MID / FWD / DEF / RUC
  - openai_input_json — full JSON payload for the AI prompt
  - updated_at        — timestamp of last reco generation (NULL if never)

  ## Security
  - View inherits access from underlying tables
  - No RLS needed — called only by service-role edge function
*/

CREATE OR REPLACE VIEW public.v_ai_rankings_generation_queue
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  jsonb_build_object(
    'player_name',           c.player_name,
    'team',                  c.team,
    'position',              c.position,
    'projection_final',      c.projection_final,
    'ceiling_estimate',      c.ceiling_estimate,
    'floor_estimate',        c.floor_estimate,
    'consistency_score',     c.consistency_score,
    'form_rating',           c.form_rating,
    'matchup_rating',        c.matchup_rating,
    'upside_rating',         c.upside_rating,
    'risk_rating',           c.risk_rating,
    'projection_confidence', c.projection_confidence,
    'captain_score',         c.captain_score,
    'captain_rating',        c.captain_rating,
    'neeko_rating',          c.neeko_rating,
    'price',                 c.price,
    'value_score',           c.value_score,
    'value_tag',             c.value_tag,
    'consistency_tier',      c.consistency_tier,
    'ai_recommendation',     c.ai_recommendation,
    'recommendation_why',    c.recommendation_why
  ) AS openai_input_json,
  r.updated_at
FROM public.v_rankings_canonical c
LEFT JOIN public.ai_rankings_player_recos r
  ON r.player_id = c.player_id
  AND r.season = 2026
WHERE
  r.updated_at IS NULL
  OR r.updated_at < now() - interval '3 days'
ORDER BY r.updated_at NULLS FIRST;

GRANT SELECT ON public.v_ai_rankings_generation_queue TO service_role;
GRANT SELECT ON public.v_ai_rankings_generation_queue TO authenticated;
