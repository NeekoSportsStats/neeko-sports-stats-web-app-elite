/*
  # Fix v_ai_player_analysis_input: COALESCE price/value_score from rankings cache

  ## Problem

  17 players have null price and value_score in afl.v_ai_player_openai_inputs_v2.
  The input view passes these nulls to OpenAI, causing the model to generate the
  fallback sentence "Without a defined price, assessing value becomes challenging..."
  even for players whose price and value are known in the rankings cache.

  ## Fix

  Rebuild v_ai_player_analysis_input to COALESCE price and value_score from
  afl.player_rankings_cache when the upstream view has nulls.
  Preserves original column types (numeric for value_score via cast).

  Also expose value_tag from the cache instead of hardcoding NULL.
  Update input_hash to include price so stale analyses are detected correctly.

  ## No destructive changes — only replaces the view.
*/

CREATE OR REPLACE VIEW afl.v_ai_player_analysis_input AS
SELECT
  v.player_id,
  v.player_name,
  v.team,
  v.projection_final,
  v.ceiling         AS ceiling_estimate,
  v.floor           AS floor_estimate,
  v.consistency_score,
  v.form_rating     AS trend_3_vs_10,
  0                 AS matchup_delta,
  COALESCE(v.price,       rc.price)                   AS price,
  -- Cast rc.value_score (double precision) to numeric to match existing column type
  COALESCE(v.value_score, rc.value_score::numeric)    AS value_score,
  COALESCE(rc.value_tag,  NULL::text)                 AS value_tag,
  md5(
    v.player_id::text
    || COALESCE(v.projection_final::text, '')
    || COALESCE(v.form_rating::text, '')
    || COALESCE(v.consistency_score::text, '')
    || COALESCE(COALESCE(v.price, rc.price)::text, '')
  ) AS input_hash
FROM afl.v_ai_player_openai_inputs_v2 v
LEFT JOIN afl.player_rankings_cache rc
  ON rc.player_id = v.player_id::integer;
