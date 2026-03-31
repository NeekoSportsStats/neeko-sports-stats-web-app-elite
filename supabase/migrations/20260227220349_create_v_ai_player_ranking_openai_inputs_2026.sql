/*
  # Create v_ai_player_ranking_openai_inputs_2026

  Input view for the rankings AI generation pipeline.

  ## Purpose
  Produces one row per player for the upcoming round, sourcing all metrics from
  v_rankings_premium (the single trusted source of computed rankings metrics) and
  joining in the round context from afl.v_ai_player_payloads_2026_next_round.

  ## Key design decisions
  - Base data: public.v_rankings_premium (already has projection, form, matchup, etc.)
  - Round context: afl.v_ai_player_payloads_2026_next_round derives round_number from
    afl.v_team_schedule_2026 (next future match). We inherit that round_number here.
  - payload: jsonb blob passed as {{DATA}} in the prompt template
  - input_hash: md5(payload::text) used by edge function for skip-if-unchanged
  - Season hardcoded to 2026 (current season)

  ## Columns
  - season, round_number, player_id, prompt_key
  - payload (jsonb) — all metrics needed for the prompt
  - input_hash (text)
*/

CREATE OR REPLACE VIEW public.v_ai_player_ranking_openai_inputs_2026 AS
WITH next_round_ctx AS (
  SELECT MIN(round_number) AS round_number
  FROM afl.v_ai_player_payloads_2026_next_round
),
player_opponent AS (
  SELECT DISTINCT
    p.player    AS player_name,
    p.team,
    p.opponent,
    p.round_number,
    p.match_date
  FROM afl.v_ai_player_payloads_2026_next_round p
  JOIN next_round_ctx nrc ON p.round_number = nrc.round_number
)
SELECT
  2026                                    AS season,
  COALESCE(po.round_number, nrc.round_number, 0) AS round_number,
  r.player_id::bigint                     AS player_id,
  'player_ranking_recommendation'::text  AS prompt_key,
  jsonb_build_object(
    'player',            r.player_name,
    'team',              r.team,
    'position',          r."position",
    'opponent',          COALESCE(po.opponent, 'TBC'),
    'projection',        r.projection_final,
    'ceiling',           r.ceiling_estimate,
    'floor',             r.floor_estimate,
    'consistency_score', r.consistency_score,
    'form_rating',       r.form_rating,
    'matchup_rating',    r.matchup_rating,
    'upside_rating',     r.upside_rating,
    'risk_rating',       r.risk_rating,
    'confidence',        r.projection_confidence,
    'captain_score',     r.captain_score,
    'captain_rating',    r.captain_rating
  )                                       AS payload,
  md5(
    jsonb_build_object(
      'player',            r.player_name,
      'team',              r.team,
      'position',          r."position",
      'opponent',          COALESCE(po.opponent, 'TBC'),
      'projection',        r.projection_final,
      'ceiling',           r.ceiling_estimate,
      'floor',             r.floor_estimate,
      'consistency_score', r.consistency_score,
      'form_rating',       r.form_rating,
      'matchup_rating',    r.matchup_rating,
      'upside_rating',     r.upside_rating,
      'risk_rating',       r.risk_rating,
      'confidence',        r.projection_confidence,
      'captain_score',     r.captain_score,
      'captain_rating',    r.captain_rating
    )::text
  )                                       AS input_hash
FROM public.v_rankings_premium r
CROSS JOIN next_round_ctx nrc
LEFT JOIN player_opponent po
  ON po.player_name = r.player_name
  AND po.team       = r.team
WHERE r.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_ranking_openai_inputs_2026 TO authenticated, anon;
