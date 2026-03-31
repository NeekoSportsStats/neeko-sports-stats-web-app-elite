/*
  # Rebuild v_ai_rankings_generation_queue — remove label columns from AI payload

  ## Problem
  The openai_input_json payload sent to the AI included ai_recommendation and
  recommendation_why. This caused the AI to echo or reinforce the model's label
  in its output, producing contradictory or redundant text.

  ## Fix
  Remove ai_recommendation and recommendation_why from openai_input_json.
  The AI now only receives quantitative signal data:
    player_name, team, position, projection_final, ceiling_estimate,
    floor_estimate, consistency_score, form_rating, matchup_rating,
    upside_rating, risk_rating, projection_confidence, captain_score,
    captain_rating, neeko_rating, price, value_score, value_tag,
    consistency_tier

  The input_hash computation is unchanged.
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
    'consistency_tier',      c.consistency_tier
  ) AS openai_input_json,

  md5(
    coalesce(c.player_id::text,        '') ||
    coalesce(c.price::text,            '') ||
    coalesce(c.projection_final::text, '') ||
    coalesce(c.neeko_rating::text,     '') ||
    coalesce(c.value_score::text,      '')
  ) AS current_input_hash,

  r.input_hash   AS stored_input_hash,
  r.updated_at   AS ai_last_generated,
  stat_freshness.latest_stat_update

FROM v_rankings_canonical c
LEFT JOIN ai_rankings_player_recos r
  ON r.player_id = c.player_id AND r.season = 2026
LEFT JOIN (
  SELECT
    p.player_id,
    max(s.updated_at) AS latest_stat_update
  FROM afl.players p
  JOIN afl.player_round_stats_2025 s ON s.player = p.player_name
  GROUP BY p.player_id
) stat_freshness ON stat_freshness.player_id = c.player_id

WHERE
  r.updated_at IS NULL
  OR r.input_hash IS NULL
  OR stat_freshness.latest_stat_update > r.updated_at
  OR (
    md5(
      coalesce(c.player_id::text,        '') ||
      coalesce(c.price::text,            '') ||
      coalesce(c.projection_final::text, '') ||
      coalesce(c.neeko_rating::text,     '') ||
      coalesce(c.value_score::text,      '')
    ) IS DISTINCT FROM r.input_hash
  )

ORDER BY stat_freshness.latest_stat_update DESC NULLS LAST;
