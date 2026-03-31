/*
  # Fix upsert_player_ai_analysis — remove hardcoded confidence default

  ## Problem
  The RPC had `p_confidence integer DEFAULT 65` and internally used
  `COALESCE(p_confidence, 65)`. This caused ALL players written by the
  AI pipeline to have confidence = 65 stored in ai.player_ai_analysis,
  overwriting the real model-derived projection_confidence values.

  ## Changes
  - Remove DEFAULT 65 from p_confidence parameter
  - Change p_confidence to accept numeric (float) and cast internally
  - Use COALESCE(p_confidence, NULL) — no forced fallback
  - The display confidence is always read from afl.player_rankings_cache.projection_confidence
    which is never touched by this RPC

  ## Notes
  - The frontend reads projection_confidence from afl.player_rankings_cache directly
  - This table's projection_confidence is set by the projection engine, not the AI pipeline
  - ai.player_ai_analysis.confidence is informational only
*/

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id         integer,
  p_recommendation    text,
  p_confidence        numeric DEFAULT NULL,
  p_summary_short     text    DEFAULT NULL,
  p_summary_long      text    DEFAULT NULL,
  p_model             text    DEFAULT 'gpt-4o-mini',
  p_input_hash        text    DEFAULT NULL,
  p_ai_input_snapshot jsonb   DEFAULT NULL,
  p_prompt_version    text    DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'ai', 'afl'
AS $$
DECLARE
  v_rec        text;
  v_projection numeric;
BEGIN
  v_rec := UPPER(TRIM(COALESCE(p_recommendation, 'HOLD')));
  IF v_rec NOT IN ('STRONG BUY', 'BUY', 'HOLD', 'SELL', 'AVOID', 'START', 'SIT') THEN
    v_rec := 'HOLD';
  END IF;

  SELECT projection_final INTO v_projection
  FROM afl.player_rankings_cache
  WHERE player_id = p_player_id
  LIMIT 1;

  INSERT INTO ai.player_ai_analysis (
    player_id,
    recommendation,
    confidence,
    summary_short,
    summary_long,
    generated_at,
    model,
    input_hash,
    stored_projection
  ) VALUES (
    p_player_id,
    v_rec,
    LEAST(100, GREATEST(0, p_confidence::integer)),
    LEFT(COALESCE(p_summary_short, ''), 300),
    LEFT(COALESCE(p_summary_long, ''), 2000),
    now(),
    COALESCE(p_model, 'gpt-4o-mini'),
    p_input_hash,
    v_projection
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation    = EXCLUDED.recommendation,
    confidence        = COALESCE(EXCLUDED.confidence, ai.player_ai_analysis.confidence),
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = now(),
    model             = EXCLUDED.model,
    input_hash        = COALESCE(EXCLUDED.input_hash, ai.player_ai_analysis.input_hash),
    stored_projection = EXCLUDED.stored_projection;

  RETURN p_player_id;
END;
$$;
