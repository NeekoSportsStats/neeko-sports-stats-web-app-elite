/*
  # Rebuild v_ai_rankings_generation_queue — Hash-Based Change Detection (v2)

  ## Summary
  Drops and recreates the queue view to add hash-based change detection columns.
  Uses DROP + CREATE to avoid column rename conflicts from the prior definition.

  ## Change Detection Logic (dual-trigger)
  A player enters the queue if ANY of the following are true:
  1. `r.updated_at IS NULL` — never generated
  2. `r.input_hash IS NULL` — backfill: hash column newly introduced
  3. `stat_freshness.latest_stat_update > r.updated_at` — new stat data ingested
  4. `r.input_hash IS DISTINCT FROM q.input_hash` — projection inputs changed
     (catches AFL stat corrections that do not update timestamps)
*/

DROP VIEW IF EXISTS public.v_ai_rankings_generation_queue;

CREATE VIEW public.v_ai_rankings_generation_queue AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c."position",
  jsonb_build_object(
    'player_name',          c.player_name,
    'team',                 c.team,
    'position',             c."position",
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
  q.input_hash          AS current_input_hash,
  r.input_hash          AS stored_input_hash,
  r.updated_at          AS ai_last_generated,
  stat_freshness.latest_stat_update
FROM v_rankings_canonical c
LEFT JOIN v_ai_player_analysis_input q
  ON q.player_id = c.player_id
LEFT JOIN ai_rankings_player_recos r
  ON r.player_id = c.player_id AND r.season = 2026
LEFT JOIN (
  SELECT p.player_id, MAX(s.updated_at) AS latest_stat_update
  FROM afl.players p
  JOIN afl.player_round_stats_2025 s ON s.player = p.player_name
  GROUP BY p.player_id
) stat_freshness ON stat_freshness.player_id = c.player_id
WHERE
  r.updated_at IS NULL
  OR r.input_hash IS NULL
  OR stat_freshness.latest_stat_update > r.updated_at
  OR (q.input_hash IS NOT NULL AND r.input_hash IS DISTINCT FROM q.input_hash)
ORDER BY stat_freshness.latest_stat_update DESC NULLS LAST;
