/*
  # Fix upsert_player_ai_analysis — Write input_hash + stored_projection to ai.player_ai_analysis

  ## Problem
  The needs_regen flag in v_ai_player_analysis_input compares
  ai.player_ai_analysis.input_hash against the live computed hash.
  Since input_hash was NEVER written to ai.player_ai_analysis, it is
  always NULL → needs_regen is always TRUE → ALL 687 players regenerate
  every single pipeline run (infinite regen loop).

  ## Root Cause
  upsert_player_ai_analysis() RPC did not accept or write:
  - input_hash
  - stored_projection
  - generated_at

  ## Fix
  1. Drop + recreate upsert_player_ai_analysis with p_input_hash + p_stored_projection params
  2. RPC now writes those fields to ai.player_ai_analysis
  3. needs_regen will correctly return FALSE for unchanged players after next regen cycle

  ## Impact
  - No data loss — COALESCE preserves existing values
  - After the next AI regen run, needs_regen will stabilise to FALSE for all stable players
  - Only players with changed projections/signals will regen on subsequent runs
*/

DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id             INT,
  p_recommendation        TEXT,
  p_recommendation_short  TEXT,
  p_recommendation_why    TEXT,
  p_color                 TEXT    DEFAULT NULL,
  p_ai_summary            TEXT    DEFAULT NULL,
  p_prompt_version        TEXT    DEFAULT NULL,
  p_input_hash            TEXT    DEFAULT NULL,
  p_stored_projection     NUMERIC DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
  v_cache_snapshot_id uuid;
BEGIN
  SELECT cache_snapshot_id INTO v_cache_snapshot_id
  FROM afl.player_rankings_cache
  WHERE player_id = p_player_id;

  UPDATE afl.player_rankings_cache SET
    recommendation_short  = COALESCE(p_recommendation_short, recommendation_short),
    recommendation_why    = COALESCE(p_recommendation_why,   recommendation_why),
    ai_recommendation     = COALESCE(p_recommendation,       ai_recommendation),
    recommendation_color  = COALESCE(p_color,                recommendation_color),
    ai_summary            = COALESCE(p_ai_summary,           ai_summary),
    ai_updated_at         = now(),
    ai_generated_at       = now(),
    ai_prompt_version     = COALESCE(p_prompt_version,       ai_prompt_version),
    ai_validation_passed  = true,
    ai_cache_snapshot_id  = v_cache_snapshot_id
  WHERE player_id = p_player_id;

  INSERT INTO ai.player_ai_analysis (
    player_id, recommendation, summary_short, summary_long,
    generated_at, input_hash, stored_projection
  )
  VALUES (
    p_player_id,
    p_recommendation,
    p_recommendation_short,
    p_recommendation_why,
    now(),
    p_input_hash,
    p_stored_projection
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation     = EXCLUDED.recommendation,
    summary_short      = EXCLUDED.summary_short,
    summary_long       = EXCLUDED.summary_long,
    generated_at       = EXCLUDED.generated_at,
    input_hash         = COALESCE(EXCLUDED.input_hash,         ai.player_ai_analysis.input_hash),
    stored_projection  = COALESCE(EXCLUDED.stored_projection,  ai.player_ai_analysis.stored_projection);

  RETURN jsonb_build_object(
    'status',      'ok',
    'player_id',   p_player_id,
    'snapshot_id', v_cache_snapshot_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status',    'error',
    'player_id', p_player_id,
    'error',     SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated, service_role;
