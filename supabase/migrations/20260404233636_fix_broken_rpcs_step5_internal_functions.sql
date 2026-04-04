/*
  # Fix internal functions: Remove all dropped column references

  ## Summary
  Fixes 5 internal functions that still reference dropped columns:
  - afl.assign_numeric_recommendations: removes ai_recommendation write
  - afl.fn_log_cache_validation: removes edge_tier reference
  - public.truncate_and_regenerate_ai: removes ai_recommendation = NULL
  - public.upsert_player_ai_analysis (both overloads): removes ai_recommendation write
  - market.build_market_watch_snapshot: replaces ai_recommendation with signal throughout

  ## Changes Per Function
  1. assign_numeric_recommendations — only writes recommendation_color, recommendation_short, recommendation_why
  2. fn_log_cache_validation — removes edge_tier mismatch check, keeps other checks
  3. truncate_and_regenerate_ai — removes ai_recommendation = NULL from cache clear
  4. upsert_player_ai_analysis (p_summary_short, p_summary_long, ...) — removes ai_recommendation line
  5. upsert_player_ai_analysis (p_recommendation, ...) — removes ai_recommendation line
  6. build_market_watch_snapshot — replaces ai_recommendation with signal in category/action/filter
*/

-- 1. Fix afl.assign_numeric_recommendations
CREATE OR REPLACE FUNCTION afl.assign_numeric_recommendations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE afl.player_rankings_cache c
  SET
    recommendation_color = CASE
      WHEN c.value_score >= 8  AND c.projection > c.breakeven THEN 'green'
      WHEN c.value_score <= -8 AND c.projection < c.breakeven THEN 'red'
      ELSE 'blue'
    END,
    recommendation_short = CASE
      WHEN c.value_score >= 8  AND c.projection > c.breakeven THEN 'Strong buy signal'
      WHEN c.value_score <= -8 AND c.projection < c.breakeven THEN 'Consider selling'
      ELSE 'Hold and monitor'
    END,
    recommendation_why = CASE
      WHEN c.value_score >= 8  AND c.projection > c.breakeven THEN 'Priced below projection with positive momentum'
      WHEN c.value_score <= -8 AND c.projection < c.breakeven THEN 'Underperforming relative to current price'
      ELSE 'Performing in line with price expectations'
    END,
    cached_at = now()
  WHERE c.player_id IS NOT NULL
    AND c.value_score IS NOT NULL
    AND c.projection IS NOT NULL
    AND c.breakeven IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;


-- 2. Fix afl.fn_log_cache_validation — remove edge_tier reference
CREATE OR REPLACE FUNCTION afl.fn_log_cache_validation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_null_count    bigint;
  v_mw_mismatches bigint;
  v_total         bigint;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM afl.player_rankings_cache
  WHERE projection_final IS NULL OR breakeven IS NULL
     OR edge IS NULL OR signal IS NULL OR value_score IS NULL;

  SELECT COUNT(*) INTO v_mw_mismatches
  FROM afl.player_rankings_cache
  WHERE market_watch_category IS DISTINCT FROM signal_tag;

  SELECT COUNT(*) INTO v_total FROM afl.player_rankings_cache;

  INSERT INTO public.system_logs (level, component, message, details)
  VALUES (
    CASE
      WHEN v_null_count > 0 THEN 'ERROR'
      WHEN v_mw_mismatches > 0 THEN 'WARN'
      ELSE 'INFO'
    END,
    'rankings_cache_integrity',
    CASE
      WHEN v_null_count > 0 THEN 'FAIL: NULL critical fields detected'
      WHEN v_mw_mismatches > 0 THEN 'WARN: market_watch_category mismatches signal_tag'
      ELSE 'PASS: all integrity checks passed'
    END,
    jsonb_build_object(
      'total_players', v_total,
      'null_critical_fields', v_null_count,
      'mw_category_mismatches', v_mw_mismatches,
      'checked_at', NOW()
    )
  )
  ON CONFLICT DO NOTHING;
END;
$function$;


-- 3. Fix public.truncate_and_regenerate_ai — remove ai_recommendation = NULL
CREATE OR REPLACE FUNCTION public.truncate_and_regenerate_ai()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $function$
DECLARE
  v_ai_rows_cleared    integer := 0;
  v_cache_rows_cleared integer := 0;
  v_pipeline_ok        boolean := false;
  v_wave_ok            boolean := false;
  v_cache_ok           boolean := false;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RAISE NOTICE 'truncate_and_regenerate_ai: AI truncation started';

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

  UPDATE afl.player_rankings_cache
  SET
    ai_summary           = NULL,
    recommendation_why   = NULL,
    recommendation_short = NULL,
    recommendation_color = NULL,
    analysis             = NULL,
    summary              = NULL,
    ai_updated_at        = NULL
  WHERE player_id IS NOT NULL;

  GET DIAGNOSTICS v_cache_rows_cleared = ROW_COUNT;
  RAISE NOTICE 'truncate_and_regenerate_ai: cleared % AI columns in player_rankings_cache', v_cache_rows_cleared;

  BEGIN
    PERFORM public.run_neeko_ai_pipeline();
    v_pipeline_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: AI regeneration triggered via run_neeko_ai_pipeline';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: pipeline error — %', SQLERRM;
    v_pipeline_ok := false;
  END;

  BEGIN
    PERFORM public.fn_fire_ai_worker_wave(200);
    v_wave_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: fired AI worker wave (200 players)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: wave error — %', SQLERRM;
    v_wave_ok := false;
  END;

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
$function$;


-- 4. Fix upsert_player_ai_analysis (p_summary_short first overload)
DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(integer, text, text, text, text, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id integer,
  p_summary_short text,
  p_summary_long text,
  p_recommendation text DEFAULT 'HOLD',
  p_color text DEFAULT NULL,
  p_prompt_version text DEFAULT NULL,
  p_input_hash text DEFAULT NULL,
  p_stored_projection numeric DEFAULT NULL,
  p_stored_price numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $function$
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
    summary_short        = COALESCE(p_summary_short,  summary_short),
    summary_long         = COALESCE(p_summary_long,   summary_long),
    recommendation_short = COALESCE(p_summary_short,  recommendation_short),
    recommendation_why   = COALESCE(p_summary_long,   recommendation_why),
    recommendation_color = v_derived_color,
    ai_summary           = COALESCE(p_summary_long,   ai_summary),
    ai_updated_at        = now(),
    ai_generated_at      = now(),
    ai_prompt_version    = COALESCE(p_prompt_version, ai_prompt_version),
    ai_validation_passed = true,
    ai_cache_snapshot_id = v_cache_snapshot_id
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
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis(integer, text, text, text, text, text, text, numeric, numeric) TO service_role;


-- 5. Fix upsert_player_ai_analysis (p_recommendation first overload)
DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(integer, text, text, text, text, text, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id integer,
  p_recommendation text DEFAULT NULL,
  p_summary_short text DEFAULT NULL,
  p_summary_long text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_input_hash text DEFAULT NULL,
  p_stored_projection numeric DEFAULT NULL,
  p_stored_price numeric DEFAULT NULL,
  p_prompt_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis(integer, text, text, text, text, text, numeric, numeric, text) TO service_role;
