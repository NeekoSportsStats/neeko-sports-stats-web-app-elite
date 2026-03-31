/*
  # Fix upsert_player_ai_analysis — Always Write input_hash

  ## Problem
  The ON CONFLICT DO UPDATE clause used COALESCE(EXCLUDED.input_hash, existing.input_hash).
  This meant if a row already had a non-null input_hash, the fresh hash from the view
  was silently discarded. As a result, 615 rows have content but NULL input_hash, making
  the needs_regen check think they always need regeneration (infinite loop / no skip logic).

  ## Fix
  - input_hash: always overwrite with EXCLUDED.input_hash (the freshly computed view hash)
  - generated_at: always overwrite with EXCLUDED.generated_at (stamp every write)
  - stored_projection and stored_price: keep COALESCE (safe to preserve if not provided)

  ## Applies To
  Both overloads of upsert_player_ai_analysis (with and without p_stored_price)
*/

-- Drop both overloads cleanly then recreate unified version

DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(
  integer, text, text, text, text, text, text, numeric
);
DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(
  integer, text, text, text, text, text, text, numeric, numeric
);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id         integer,
  p_summary_short     text,
  p_summary_long      text,
  p_recommendation    text    DEFAULT 'HOLD',
  p_color             text    DEFAULT NULL,
  p_prompt_version    text    DEFAULT NULL,
  p_input_hash        text    DEFAULT NULL,
  p_stored_projection numeric DEFAULT NULL,
  p_stored_price      numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
  v_cache_snapshot_id uuid;
  v_derived_color     text;
BEGIN
  SELECT cache_snapshot_id INTO v_cache_snapshot_id
  FROM afl.player_rankings_cache
  WHERE player_id = p_player_id;

  v_derived_color := COALESCE(p_color, CASE UPPER(p_recommendation)
    WHEN 'BUY'   THEN 'green'
    WHEN 'START' THEN 'green'
    WHEN 'SELL'  THEN 'red'
    WHEN 'SIT'   THEN 'orange'
    ELSE 'blue'
  END);

  -- Write to cache — all canonical and legacy columns
  UPDATE afl.player_rankings_cache SET
    summary_short         = COALESCE(p_summary_short,  summary_short),
    summary_long          = COALESCE(p_summary_long,   summary_long),
    recommendation_short  = COALESCE(p_summary_short,  recommendation_short),
    recommendation_why    = COALESCE(p_summary_long,   recommendation_why),
    ai_recommendation     = COALESCE(p_recommendation, ai_recommendation),
    recommendation_color  = v_derived_color,
    ai_summary            = COALESCE(p_summary_long,   ai_summary),
    ai_updated_at         = now(),
    ai_generated_at       = now(),
    ai_prompt_version     = COALESCE(p_prompt_version, ai_prompt_version),
    ai_validation_passed  = true,
    ai_cache_snapshot_id  = v_cache_snapshot_id
  WHERE player_id = p_player_id;

  -- Write to canonical AI table
  -- CRITICAL: input_hash is ALWAYS overwritten (not COALESCED) so change-detection works
  INSERT INTO ai.player_ai_analysis (
    player_id, recommendation, summary_short, summary_long,
    generated_at, input_hash, stored_projection, stored_price
  )
  VALUES (
    p_player_id,
    p_recommendation,
    p_summary_short,
    p_summary_long,
    now(),
    p_input_hash,
    p_stored_projection,
    p_stored_price
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation    = COALESCE(EXCLUDED.recommendation,    ai.player_ai_analysis.recommendation),
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = EXCLUDED.generated_at,
    -- FIXED: always write the fresh hash — never preserve stale hash
    input_hash        = EXCLUDED.input_hash,
    stored_projection = COALESCE(EXCLUDED.stored_projection, ai.player_ai_analysis.stored_projection),
    stored_price      = COALESCE(EXCLUDED.stored_price,      ai.player_ai_analysis.stored_price);

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
