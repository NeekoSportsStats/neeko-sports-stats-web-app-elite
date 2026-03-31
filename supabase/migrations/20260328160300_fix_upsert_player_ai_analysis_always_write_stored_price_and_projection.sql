/*
  # Fix upsert_player_ai_analysis — always overwrite stored_price and stored_projection

  ## Problem
  724 players are perpetually stuck with needs_regen=true in v_ai_player_analysis_input.
  The view's CASE expression triggers regen when:
    abs(c.price - a.stored_price) > 5000

  Root cause: when generate-player-ai writes back AI results, it was not passing
  p_stored_price. The ON CONFLICT clause used COALESCE, so the old stale price was
  preserved forever. Every subsequent pipeline run sees the price has changed >$5k
  and marks the player for regen again — creating an infinite loop.

  ## Fix
  1. In the ON CONFLICT clause, always overwrite stored_price and stored_projection
     with the new value (matching how input_hash is already handled).
  2. The edge function (generate-player-ai) already updated to pass p_stored_price.

  ## Impact
  After the next AI generation wave, all 724 stale players will have their
  stored_price snapped to the current price and needs_regen will clear.
*/

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
    recommendation    = COALESCE(EXCLUDED.recommendation, ai.player_ai_analysis.recommendation),
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = EXCLUDED.generated_at,
    -- Always overwrite hash, projection, and price so change-detection clears correctly
    input_hash        = EXCLUDED.input_hash,
    stored_projection = EXCLUDED.stored_projection,
    stored_price      = EXCLUDED.stored_price;

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
