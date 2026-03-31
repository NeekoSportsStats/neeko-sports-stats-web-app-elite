/*
  # Backfill afl.ai_match_predictions numeric columns from JSONB payload

  ## Problem
  The edge function generate-match-summary writes ai_summary but never writes
  predicted_home_score, predicted_away_score, predicted_margin, predicted_total,
  or confidence. All 5 rows in ai_match_predictions have NULL numerics.

  ## Evidence
  - afl.v_ai_match_openai_inputs_2026_next_round.final_openai_input->payload->predictions
    contains: home_score, away_score, margin, total
  - afl.v_ai_match_openai_inputs_2026_next_round.final_openai_input->payload->home_team
    contains: confidence (text)
  - The 5 existing rows all have match_ids 3345–3349 (2026, round 0) which are
    present in the inputs view

  ## Strategy — Rule A (deterministic, no OpenAI parsing)
  Numeric values are sourced directly from the JSONB payload that the edge function
  already reads. This is idempotent and produces the same values on every run.

  ## UPSERT key
  UNIQUE constraint: ai_match_predictions_match_id_key on (match_id)

  ## Field mapping
  | Source (JSONB path)                              | Target column        |
  |--------------------------------------------------|----------------------|
  | payload.predictions.home_score                   | predicted_home_score |
  | payload.predictions.away_score                   | predicted_away_score |
  | payload.predictions.margin                       | predicted_margin     |
  | payload.predictions.total                        | predicted_total      |
  | payload.predictions.margin (win-direction proxy) | prediction           |
  | payload.home_team.confidence                     | confidence           |

  ## Notes
  - Fully idempotent: ON CONFLICT (match_id) DO UPDATE
  - Only updates numeric fields + confidence + updated_at; preserves existing ai_summary
  - No objects dropped, no tables truncated
*/

UPDATE afl.ai_match_predictions amp
SET
  predicted_home_score = (inp.final_openai_input->'payload'->'predictions'->>'home_score')::numeric,
  predicted_away_score = (inp.final_openai_input->'payload'->'predictions'->>'away_score')::numeric,
  predicted_margin     = (inp.final_openai_input->'payload'->'predictions'->>'margin')::numeric,
  predicted_total      = (inp.final_openai_input->'payload'->'predictions'->>'total')::numeric,
  prediction           = (inp.final_openai_input->'payload'->'predictions'->>'margin')::numeric,
  confidence           = (inp.final_openai_input->'payload'->'home_team'->>'confidence'),
  updated_at           = now()
FROM afl.v_ai_match_openai_inputs_2026_next_round inp
WHERE amp.match_id = inp.match_id
  AND (
    amp.predicted_home_score IS NULL
    OR amp.predicted_away_score IS NULL
    OR amp.predicted_margin IS NULL
  );
