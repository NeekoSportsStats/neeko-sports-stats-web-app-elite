/*
  # Step 7 — Fix upsert_player_ai_analysis, enqueue_ranking_reco_jobs, fn_validate_rankings_cache_integrity

  - upsert_player_ai_analysis: remove write to ai_recommendation column
  - enqueue_ranking_reco_jobs: remove ai_recommendation from payload
  - fn_validate_rankings_cache_integrity: remove edge_tier vs signal check (legacy),
    replace with canonical edge formula check against breakeven
*/

-- ============================================================
-- upsert_player_ai_analysis — remove ai_recommendation write
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id        integer,
  p_summary_short    text,
  p_summary_long     text,
  p_recommendation   text DEFAULT 'HOLD',
  p_color            text DEFAULT NULL,
  p_prompt_version   text DEFAULT NULL,
  p_input_hash       text DEFAULT NULL,
  p_stored_projection numeric DEFAULT NULL,
  p_stored_price     numeric DEFAULT NULL
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
$$;


-- ============================================================
-- enqueue_ranking_reco_jobs — remove ai_recommendation from payload
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_ranking_reco_jobs(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ai_generation_queue (
    player_id,
    job_type,
    status,
    priority,
    payload,
    input_hash
  )
  SELECT
    c.player_id,
    'ranking_recommendation',
    'pending',
    1,
    jsonb_build_object(
      'player_id',         c.player_id,
      'player_name',       c.player_name,
      'team',              c.team,
      'position',          c.position,
      'projection_final',  c.projection_final,
      'ceiling_estimate',  c.ceiling,
      'floor_estimate',    c.floor,
      'consistency_score', COALESCE(c.consistency, 50),
      'form_rating',       COALESCE(c.form_score, 50),
      'captain_score',     COALESCE(c.captain_score, 0),
      'risk_rating',       COALESCE(c.risk_rating, 50),
      'confidence',        COALESCE(c.projection_confidence, 50),
      'value_score',       c.value_score,
      'price',             c.price,
      'signal',            COALESCE(c.signal, 'HOLD'),
      'value_tag',         c.value_tag,
      'neeko_rating',      c.neeko_rating_scaled
    ),
    md5(
      COALESCE(c.projection_final::text, '') ||
      COALESCE(c.value_score::text, '') ||
      COALESCE(c.neeko_rating_scaled::text, '') ||
      COALESCE(c.games_played::text, '')
    )
  FROM afl.player_rankings_cache c
  WHERE
    p_force = true
    OR NOT EXISTS (
      SELECT 1 FROM public.ai_rankings_player_recos r
      WHERE r.player_id = c.player_id
      AND r.input_hash = md5(
        COALESCE(c.projection_final::text, '') ||
        COALESCE(c.value_score::text, '') ||
        COALESCE(c.neeko_rating_scaled::text, '') ||
        COALESCE(c.games_played::text, '')
      )
    )
  ON CONFLICT (player_id, job_type) DO UPDATE
    SET status     = 'pending',
        payload    = EXCLUDED.payload,
        input_hash = EXCLUDED.input_hash,
        updated_at = now()
  WHERE public.ai_generation_queue.status IN ('failed', 'complete');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('enqueued', v_count);
END;
$$;


-- ============================================================
-- fn_validate_rankings_cache_integrity — remove edge_tier checks
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_validate_rankings_cache_integrity()
RETURNS TABLE(check_name text, status text, row_count bigint, detail text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
-- Check 1: NULL critical fields
SELECT
  'null_critical_fields'::text,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  COUNT(*),
  'Players with NULL projection_final, breakeven, edge, signal, or value_score'::text
FROM afl.player_rankings_cache
WHERE projection_final IS NULL
   OR breakeven IS NULL
   OR edge IS NULL
   OR signal IS NULL
   OR value_score IS NULL

UNION ALL

-- Check 2: edge = projection_final - breakeven (canonical formula)
SELECT
  'edge_formula_integrity'::text,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  COUNT(*),
  'Players where edge diverges from (projection_final - breakeven) by >0.5'::text
FROM afl.player_rankings_cache
WHERE breakeven IS NOT NULL
  AND projection_final IS NOT NULL
  AND ABS(edge - (projection_final - breakeven)) > 0.5

UNION ALL

-- Check 3: signal matches canonical edge thresholds
SELECT
  'signal_threshold_violations'::text,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  COUNT(*),
  'Players where signal does not match canonical edge thresholds'::text
FROM afl.player_rankings_cache
WHERE NOT (
  (signal = 'STRONG_BUY'  AND edge >= 20)
  OR (signal = 'BUY'      AND edge >= 10  AND edge < 20)
  OR (signal = 'HOLD'     AND edge >= -5  AND edge < 10)
  OR (signal = 'SELL'     AND edge >= -15 AND edge < -5)
  OR (signal = 'STRONG_SELL' AND edge < -15)
)

UNION ALL

-- Check 4: market_watch_category alignment with signal
SELECT
  'market_watch_category_alignment'::text,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
  COUNT(*),
  'Players where market_watch_category does not match signal_tag'::text
FROM afl.player_rankings_cache
WHERE market_watch_category IS DISTINCT FROM signal_tag

UNION ALL

-- Check 5: value_score within expected range
SELECT
  'value_score_range'::text,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  COUNT(*),
  'Players where value_score is outside expected [-50, 50] range'::text
FROM afl.player_rankings_cache
WHERE value_score IS NOT NULL AND ABS(value_score) > 50

UNION ALL

-- Check 6: minimum player count
SELECT
  'minimum_player_count'::text,
  CASE WHEN COUNT(*) >= 100 THEN 'PASS' ELSE 'FAIL' END,
  COUNT(*),
  'Total active players in cache (minimum 100 required)'::text
FROM afl.player_rankings_cache

UNION ALL

-- Check 7: signal distribution sanity
SELECT
  'signal_distribution_sanity'::text,
  CASE WHEN MAX(pct) < 70 THEN 'PASS' ELSE 'FAIL' END,
  SUM(cnt),
  'No single signal should represent >70% of all players'::text
FROM (
  SELECT signal, COUNT(*) as cnt,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
  FROM afl.player_rankings_cache
  GROUP BY signal
) x;
$$;
