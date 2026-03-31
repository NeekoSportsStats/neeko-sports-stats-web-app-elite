/*
  # Rebuild v_ai_rankings_generation_queue — Data-Change Detection

  ## Summary
  Replaces the time-based 3-day staleness logic with data-change detection.

  ## Previous Logic
  AI regeneration was triggered when:
  - ai_rankings_player_recos.updated_at IS NULL (never generated), OR
  - updated_at < now() - interval '3 days' (older than 3 days, regardless of data changes)

  ## New Logic
  AI regeneration is triggered when:
  - The player has never had AI generated (ai_rankings_player_recos row is missing), OR
  - The latest stat ingest for that player (MAX of player_round_stats_2025.updated_at joined
    by player name) is newer than the last AI generation timestamp

  ## Join Chain
  afl.players (player_id, player_name)
    → afl.player_round_stats_2025 (player = player_name) — gets latest stat update
    → public.ai_rankings_player_recos (player_id) — gets last AI generation time
    → public.v_rankings_canonical (player_id) — supplies the full openai_input_json payload

  ## Columns Preserved (unchanged — required by enqueue_ranking_reco_jobs)
  - player_id
  - player_name
  - team
  - position
  - openai_input_json
  - updated_at (renamed meaning: now represents ai_last_generated, was already this)

  ## New Columns Added
  - latest_stat_update — MAX(player_round_stats_2025.updated_at) per player

  ## Notes
  - The enqueue_ranking_reco_jobs() function reads player_id, player_name, team, position,
    openai_input_json from this view — all preserved
  - ORDER BY latest_stat_update DESC NULLS LAST ensures most-recently-changed players
    are enqueued first
  - The 3-day interval expression now() - interval '3 days' is fully removed
*/

CREATE OR REPLACE VIEW public.v_ai_rankings_generation_queue AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  jsonb_build_object(
    'player_name',          c.player_name,
    'team',                 c.team,
    'position',             c.position,
    'projection_final',     c.projection_final,
    'ceiling_estimate',     c.ceiling_estimate,
    'floor_estimate',       c.floor_estimate,
    'consistency_score',    c.consistency_score,
    'form_rating',          c.form_rating,
    'matchup_rating',       c.matchup_rating,
    'upside_rating',        c.upside_rating,
    'risk_rating',          c.risk_rating,
    'projection_confidence',c.projection_confidence,
    'captain_score',        c.captain_score,
    'captain_rating',       c.captain_rating,
    'neeko_rating',         c.neeko_rating,
    'price',                c.price,
    'value_score',          c.value_score,
    'value_tag',            c.value_tag,
    'consistency_tier',     c.consistency_tier,
    'ai_recommendation',    c.ai_recommendation,
    'recommendation_why',   c.recommendation_why
  ) AS openai_input_json,
  r.updated_at,
  stat_freshness.latest_stat_update
FROM public.v_rankings_canonical c
LEFT JOIN public.ai_rankings_player_recos r
  ON r.player_id = c.player_id
  AND r.season = 2026
LEFT JOIN (
  SELECT
    p.player_id,
    MAX(s.updated_at) AS latest_stat_update
  FROM afl.players p
  JOIN afl.player_round_stats_2025 s
    ON s.player = p.player_name
  GROUP BY p.player_id
) stat_freshness
  ON stat_freshness.player_id = c.player_id
WHERE
  r.updated_at IS NULL
  OR stat_freshness.latest_stat_update > r.updated_at
ORDER BY
  stat_freshness.latest_stat_update DESC NULLS LAST;
