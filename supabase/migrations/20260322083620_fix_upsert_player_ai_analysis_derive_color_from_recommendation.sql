/*
  # Fix upsert_player_ai_analysis — derive recommendation_color when p_color is NULL

  The edge function passes p_color = null for every player.
  This patches the upsert function to derive the color from p_recommendation
  when no explicit color is provided, so recommendation_color is always populated.

  Color mapping:
    BUY   → 'green'
    SELL  → 'red'
    START → 'green'
    SIT   → 'orange'
    HOLD  → 'blue'  (default)
*/

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id       int,
  p_summary_short   text,
  p_summary_long    text,
  p_recommendation  text DEFAULT 'HOLD',
  p_color           text DEFAULT NULL,
  p_prompt_version  text DEFAULT NULL,
  p_input_hash      text DEFAULT NULL,
  p_stored_projection numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
  v_cache_snapshot_id uuid;
  v_derived_color text;
BEGIN
  SELECT cache_snapshot_id INTO v_cache_snapshot_id
  FROM afl.player_rankings_cache
  WHERE player_id = p_player_id;

  -- Derive color from recommendation when not explicitly provided
  v_derived_color := COALESCE(p_color, CASE UPPER(p_recommendation)
    WHEN 'BUY'   THEN 'green'
    WHEN 'START' THEN 'green'
    WHEN 'SELL'  THEN 'red'
    WHEN 'SIT'   THEN 'orange'
    ELSE 'blue'
  END);

  -- Write to cache — both canonical and legacy columns for safe transition
  UPDATE afl.player_rankings_cache SET
    summary_short         = COALESCE(p_summary_short,   summary_short),
    summary_long          = COALESCE(p_summary_long,    summary_long),
    recommendation_short  = COALESCE(p_summary_short,   recommendation_short),
    recommendation_why    = COALESCE(p_summary_long,    recommendation_why),
    ai_recommendation     = COALESCE(p_recommendation,  ai_recommendation),
    recommendation_color  = v_derived_color,
    ai_summary            = COALESCE(p_summary_long,    ai_summary),
    ai_updated_at         = now(),
    ai_generated_at       = now(),
    ai_prompt_version     = COALESCE(p_prompt_version,  ai_prompt_version),
    ai_validation_passed  = true,
    ai_cache_snapshot_id  = v_cache_snapshot_id
  WHERE player_id = p_player_id;

  -- Write to canonical AI table
  INSERT INTO ai.player_ai_analysis (
    player_id, recommendation, summary_short, summary_long,
    generated_at, input_hash, stored_projection
  )
  VALUES (
    p_player_id,
    p_recommendation,
    p_summary_short,
    p_summary_long,
    now(),
    p_input_hash,
    p_stored_projection
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation    = COALESCE(EXCLUDED.recommendation,   ai.player_ai_analysis.recommendation),
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = EXCLUDED.generated_at,
    input_hash        = COALESCE(EXCLUDED.input_hash,        ai.player_ai_analysis.input_hash),
    stored_projection = COALESCE(EXCLUDED.stored_projection, ai.player_ai_analysis.stored_projection);

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
