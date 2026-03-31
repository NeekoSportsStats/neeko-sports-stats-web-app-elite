/*
  # Create truncate_and_regenerate_ai() — Safe One-Click AI Reset

  ## Purpose
  Single admin command that:
  1. Clears AI text fields in both ai.player_ai_analysis and afl.player_rankings_cache
     (does NOT delete rows — structure is preserved)
  2. Triggers the AI pipeline to enqueue all players
  3. Fires a large worker wave for fast regeneration
  4. Refreshes the rankings cache so the UI reflects cleared state immediately

  ## Safety
  - Uses UPDATE not DELETE — no data loss risk
  - Guards against NULL player_id
  - Logs progress via RAISE NOTICE
  - Returns diagnostic JSON (rows_cleared, pipeline_ok, cache_ok)

  ## Tables Cleared
  - ai.player_ai_analysis: summary_short, summary_long, confidence, generated_at, input_hash
  - afl.player_rankings_cache: ai_summary, ai_recommendation, recommendation_why,
      recommendation_short, recommendation_color, analysis, summary, ai_updated_at
*/

CREATE OR REPLACE FUNCTION public.truncate_and_regenerate_ai()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl', 'ai'
AS $$
DECLARE
  v_ai_rows_cleared   integer := 0;
  v_cache_rows_cleared integer := 0;
  v_pipeline_ok       boolean := false;
  v_wave_ok           boolean := false;
  v_cache_ok          boolean := false;
BEGIN
  RAISE NOTICE 'truncate_and_regenerate_ai: AI truncation started';

  -- 1. CLEAR AI TEXT in ai.player_ai_analysis (keep rows, nullify content)
  UPDATE ai.player_ai_analysis
  SET
    summary_short  = NULL,
    summary_long   = NULL,
    confidence     = NULL,
    generated_at   = NULL,
    input_hash     = NULL,
    recommendation = NULL
  WHERE player_id IS NOT NULL;

  GET DIAGNOSTICS v_ai_rows_cleared = ROW_COUNT;
  RAISE NOTICE 'truncate_and_regenerate_ai: cleared % rows in ai.player_ai_analysis', v_ai_rows_cleared;

  -- 2. CLEAR AI TEXT in afl.player_rankings_cache
  UPDATE afl.player_rankings_cache
  SET
    ai_summary           = NULL,
    ai_recommendation    = NULL,
    recommendation_why   = NULL,
    recommendation_short = NULL,
    recommendation_color = NULL,
    analysis             = NULL,
    summary              = NULL,
    ai_updated_at        = NULL
  WHERE player_id IS NOT NULL;

  GET DIAGNOSTICS v_cache_rows_cleared = ROW_COUNT;
  RAISE NOTICE 'truncate_and_regenerate_ai: cleared % AI columns in player_rankings_cache', v_cache_rows_cleared;

  -- 3. TRIGGER AI PIPELINE (enqueue all players needing analysis)
  BEGIN
    PERFORM public.run_neeko_ai_pipeline();
    v_pipeline_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: AI regeneration triggered via run_neeko_ai_pipeline';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: pipeline error — %', SQLERRM;
    v_pipeline_ok := false;
  END;

  -- 4. FIRE LARGE WORKER WAVE for fast initial regen
  BEGIN
    PERFORM public.fn_fire_ai_worker_wave(200);
    v_wave_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: fired AI worker wave (200 players)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: wave error — %', SQLERRM;
    v_wave_ok := false;
  END;

  -- 5. REFRESH RANKINGS CACHE so UI shows cleared state immediately
  BEGIN
    PERFORM public.refresh_player_rankings_cache();
    v_cache_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: rankings cache refreshed';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: cache refresh error — %', SQLERRM;
    v_cache_ok := false;
  END;

  RAISE NOTICE 'truncate_and_regenerate_ai: complete';

  RETURN jsonb_build_object(
    'ok',                 true,
    'ai_rows_cleared',    v_ai_rows_cleared,
    'cache_rows_cleared', v_cache_rows_cleared,
    'pipeline_ok',        v_pipeline_ok,
    'wave_ok',            v_wave_ok,
    'cache_ok',           v_cache_ok
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.truncate_and_regenerate_ai() TO service_role;
