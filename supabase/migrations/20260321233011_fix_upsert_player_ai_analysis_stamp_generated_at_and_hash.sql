/*
  # Fix upsert_player_ai_analysis — stamp generated_at and input_hash

  ## Problem
  The two integer-confidence overloads of upsert_player_ai_analysis insert rows into
  ai.player_ai_analysis but do NOT stamp generated_at or input_hash. This causes:
    - generated_at = NULL on every row
    - input_hash = NULL on every row
    - v_ai_player_analysis_input.needs_regen = TRUE permanently for all players
    - Infinite 5-minute regen loop that never converges

  ## Fix
  Drop and recreate both integer-confidence overloads so that:
    - INSERT always sets generated_at = now()
    - ON CONFLICT UPDATE always sets generated_at = now()
    - input_hash is stamped when p_input_hash is provided
    - The p_confidence integer overload (called by edge function) is corrected

  ## Overloads corrected
  1. upsert_player_ai_analysis(integer, text, integer, text, text, text, text)
     — the overload the edge function calls (p_confidence integer)
  2. upsert_player_ai_analysis(integer, text, numeric, text, text, text, text, jsonb, text)
     — the full overload with p_ai_input_snapshot

  ## Security
  Both remain SECURITY DEFINER with search_path = 'public', 'ai', 'afl'
*/

-- ── OVERLOAD 1: integer confidence (called by generate-player-ai edge function) ──

DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(
  integer, text, integer, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id      integer,
  p_recommendation text,
  p_confidence     integer DEFAULT 65,
  p_summary_short  text    DEFAULT NULL,
  p_summary_long   text    DEFAULT NULL,
  p_model          text    DEFAULT 'gpt-4o-mini',
  p_input_hash     text    DEFAULT NULL
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
    LEAST(100, GREATEST(0, COALESCE(p_confidence, 65))),
    LEFT(COALESCE(p_summary_short, ''), 300),
    LEFT(COALESCE(p_summary_long, ''), 2000),
    now(),
    COALESCE(p_model, 'gpt-4o-mini'),
    p_input_hash,
    v_projection
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation    = EXCLUDED.recommendation,
    confidence        = EXCLUDED.confidence,
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = now(),
    model             = EXCLUDED.model,
    input_hash        = COALESCE(EXCLUDED.input_hash, ai.player_ai_analysis.input_hash),
    stored_projection = EXCLUDED.stored_projection;

  RETURN p_player_id;
END;
$$;

-- ── OVERLOAD 2: numeric confidence with ai_input_snapshot ──

DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(
  integer, text, numeric, text, text, text, text, jsonb, text
);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id          integer,
  p_recommendation     text,
  p_confidence         numeric,
  p_summary_short      text,
  p_summary_long       text,
  p_model              text    DEFAULT 'gpt-4o-mini',
  p_input_hash         text    DEFAULT NULL,
  p_ai_input_snapshot  jsonb   DEFAULT NULL,
  p_prompt_version     text    DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
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
    stored_projection,
    ai_input_snapshot
  ) VALUES (
    p_player_id,
    v_rec,
    LEAST(100, GREATEST(0, COALESCE(p_confidence, 65))),
    LEFT(COALESCE(p_summary_short, ''), 300),
    LEFT(COALESCE(p_summary_long, ''), 2000),
    now(),
    COALESCE(p_model, 'gpt-4o-mini'),
    p_input_hash,
    v_projection,
    p_ai_input_snapshot
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation      = EXCLUDED.recommendation,
    confidence          = EXCLUDED.confidence,
    summary_short       = EXCLUDED.summary_short,
    summary_long        = EXCLUDED.summary_long,
    generated_at        = now(),
    model               = EXCLUDED.model,
    input_hash          = COALESCE(EXCLUDED.input_hash, ai.player_ai_analysis.input_hash),
    stored_projection   = EXCLUDED.stored_projection,
    ai_input_snapshot   = EXCLUDED.ai_input_snapshot;

  RETURN p_player_id;
END;
$$;
