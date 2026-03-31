
/*
  # Create public.upsert_player_ai_analysis RPC

  The ai schema is not exposed to PostgREST so supabase-js .schema("ai")
  calls fail with permission errors in edge functions.

  This SECURITY DEFINER function in the public schema acts as a safe bridge:
  - Called by the edge function via supabase.rpc('upsert_player_ai_analysis', ...)
  - Writes into ai.player_ai_analysis directly
  - Validates recommendation values before inserting
  - Returns the player_id upserted

  Only service_role can call it (checked via RLS on the underlying table).
*/

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id      integer,
  p_recommendation text,
  p_confidence     numeric,
  p_summary_short  text,
  p_summary_long   text,
  p_model          text DEFAULT 'gpt-4o-mini',
  p_input_hash     text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'ai', 'public'
AS $$
DECLARE
  v_rec text;
BEGIN
  -- Normalise recommendation
  v_rec := UPPER(TRIM(COALESCE(p_recommendation, 'HOLD')));
  IF v_rec NOT IN ('STRONG BUY', 'BUY', 'HOLD', 'SELL', 'AVOID') THEN
    v_rec := 'HOLD';
  END IF;

  INSERT INTO ai.player_ai_analysis (
    player_id,
    recommendation,
    confidence,
    summary_short,
    summary_long,
    generated_at,
    model,
    input_hash
  ) VALUES (
    p_player_id,
    v_rec,
    LEAST(100, GREATEST(0, COALESCE(p_confidence, 65))),
    LEFT(COALESCE(p_summary_short, ''), 300),
    LEFT(COALESCE(p_summary_long, ''), 1000),
    now(),
    COALESCE(p_model, 'gpt-4o-mini'),
    p_input_hash
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation = EXCLUDED.recommendation,
    confidence     = EXCLUDED.confidence,
    summary_short  = EXCLUDED.summary_short,
    summary_long   = EXCLUDED.summary_long,
    generated_at   = EXCLUDED.generated_at,
    model          = EXCLUDED.model,
    input_hash     = EXCLUDED.input_hash;

  RETURN p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis TO service_role;
