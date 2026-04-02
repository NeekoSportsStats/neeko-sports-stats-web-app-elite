/*
  # Fix: AI infinite regen loop — upsert_player_ai_analysis must reset needs_regen

  ## Problem
  upsert_player_ai_analysis writes summary content, input_hash, and
  generated_at on every successful AI write — but it NEVER sets
  needs_regen = false. Once a player is flagged (e.g. by the v15 prompt
  upgrade mass-regen), the flag is permanent.

  Result: 724 players perpetually show needs_regen = true, the AI health
  guard triggers recovery waves on every pipeline run, and the every-2-minute
  cron fires continuously — all wasted compute.

  ## Root Cause
  The ON CONFLICT DO UPDATE block in upsert_player_ai_analysis does not
  include needs_regen = false. The INSERT path also omits it.

  ## Fix
  1. Rebuild upsert_player_ai_analysis to always write needs_regen = false
     when a valid summary_short is provided.
  2. Backfill: reset needs_regen = false for all 687 rows that already have
     a valid summary and a stored input_hash.

  ## Tables Modified
  - ai.player_ai_analysis — needs_regen = false on upsert and backfill
*/

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id         integer,
  p_recommendation    text    DEFAULT NULL,
  p_summary_short     text    DEFAULT NULL,
  p_summary_long      text    DEFAULT NULL,
  p_color             text    DEFAULT NULL,
  p_input_hash        text    DEFAULT NULL,
  p_stored_projection numeric DEFAULT NULL,
  p_stored_price      numeric DEFAULT NULL,
  p_prompt_version    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    generated_at, input_hash, stored_projection, stored_price,
    needs_regen, needs_regen_reason
  )
  VALUES (
    p_player_id,
    p_recommendation,
    p_summary_short,
    p_summary_long,
    now(),
    p_input_hash,
    p_stored_projection,
    p_stored_price,
    false,
    NULL
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation      = COALESCE(EXCLUDED.recommendation, ai.player_ai_analysis.recommendation),
    summary_short       = EXCLUDED.summary_short,
    summary_long        = EXCLUDED.summary_long,
    generated_at        = EXCLUDED.generated_at,
    input_hash          = EXCLUDED.input_hash,
    stored_projection   = EXCLUDED.stored_projection,
    stored_price        = EXCLUDED.stored_price,
    needs_regen         = false,
    needs_regen_reason  = NULL;

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

-- Backfill: clear stale needs_regen flag for already-generated players.
-- Players with summary_short, a stored input_hash, and generated_at are fully
-- complete. The flag was never cleared after the v15 mass-regen batch.
UPDATE ai.player_ai_analysis
SET
  needs_regen        = false,
  needs_regen_reason = NULL
WHERE needs_regen = true
  AND summary_short IS NOT NULL
  AND summary_long  IS NOT NULL
  AND input_hash    IS NOT NULL
  AND generated_at  IS NOT NULL;
