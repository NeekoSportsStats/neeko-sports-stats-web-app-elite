/*
  # Fix 2b: Correct run_neeko_ai_enqueue column names for ai.player_ai_analysis

  ## Problem
  The previous fix used `updated_at` which does not exist in `ai.player_ai_analysis`.
  The actual columns are: player_id, recommendation, summary_short, summary_long,
  confidence, generated_at, model, input_hash, stored_projection.

  ## Fix
  Remove `updated_at` from the UPDATE statement — only clear `input_hash` and
  `generated_at` to signal staleness to the generate-player-ai edge function.
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_enqueue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ai, afl
AS $$
DECLARE
  v_stale_count   integer := 0;
  v_missing_count integer := 0;
  v_total         integer := 0;
BEGIN
  -- Count players missing AI analysis entirely
  SELECT COUNT(*) INTO v_missing_count
  FROM public.v_ai_player_analysis_input v
  WHERE NOT EXISTS (
    SELECT 1 FROM ai.player_ai_analysis a WHERE a.player_id = v.player_id
  );

  -- Count players with stale AI analysis (input_hash changed)
  SELECT COUNT(*) INTO v_stale_count
  FROM public.v_ai_player_analysis_input v
  JOIN ai.player_ai_analysis a ON a.player_id = v.player_id
  WHERE v.input_hash IS DISTINCT FROM a.input_hash
    AND v.input_hash IS NOT NULL;

  v_total := v_missing_count + v_stale_count;

  -- Mark stale rows by clearing input_hash + generated_at so generate-player-ai
  -- treats them as needing regeneration
  UPDATE ai.player_ai_analysis a
  SET
    input_hash   = NULL,
    generated_at = NULL
  FROM public.v_ai_player_analysis_input v
  WHERE a.player_id = v.player_id
    AND v.input_hash IS DISTINCT FROM a.input_hash
    AND v.input_hash IS NOT NULL;

  RETURN jsonb_build_object(
    'status',          'enqueue_complete',
    'missing_players', v_missing_count,
    'stale_players',   v_stale_count,
    'total_flagged',   v_total
  );
END;
$$;
