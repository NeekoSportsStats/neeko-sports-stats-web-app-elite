/*
  # Fix get_ai_regen_progress RPC — use canonical summary_short / summary_long

  ## Changes
  - Replaces legacy `recommendation_short` / `recommendation_why` column references
    with canonical `summary_short` / `summary_long` in the progress tracking RPC
  - Fixes `ai_generated_at` reference to use `ai_updated_at` (correct cache column name)
  - Priority query now correctly identifies players missing canonical AI content
*/

CREATE OR REPLACE FUNCTION public.get_ai_regen_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $function$
DECLARE
  v_completed        INT;
  v_remaining        INT;
  v_total            INT;
  v_priority_rem     INT;
  v_last_generated   TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE summary_short IS NOT NULL AND summary_long IS NOT NULL),
    COUNT(*) FILTER (WHERE summary_short IS NULL OR summary_long IS NULL),
    COUNT(*)
  INTO v_completed, v_remaining, v_total
  FROM afl.player_rankings_cache;

  SELECT COUNT(*) INTO v_priority_rem
  FROM (
    SELECT player_id
    FROM afl.player_rankings_cache
    ORDER BY neeko_rating DESC NULLS LAST
    LIMIT 150
  ) top150
  WHERE top150.player_id IN (
    SELECT player_id FROM afl.player_rankings_cache
    WHERE summary_short IS NULL OR summary_long IS NULL
  );

  SELECT MAX(ai_updated_at) INTO v_last_generated
  FROM afl.player_rankings_cache
  WHERE ai_updated_at IS NOT NULL;

  RETURN jsonb_build_object(
    'completed',          v_completed,
    'remaining',          v_remaining,
    'total',              v_total,
    'pct_complete',       CASE WHEN v_total > 0 THEN ROUND((v_completed::numeric / v_total) * 100, 1) ELSE 0 END,
    'priority_remaining', v_priority_rem,
    'last_generated_at',  v_last_generated
  );
END;
$function$;
