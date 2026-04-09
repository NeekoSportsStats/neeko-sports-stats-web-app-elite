/*
  # FIX 3 — Update fn_validate_rankings_completeness() to use blended breakeven fallback

  ## Problem
  The validator function fn_validate_rankings_completeness() repairs NULL breakeven_canonical
  values using the old formula:
    SET breakeven_canonical = GREATEST(COALESCE(season_avg, projection_final, 0), 0)
  
  This would set breakeven=0 for any player whose season_avg is NULL (i.e., players
  with 0 games played), which is the same bug that was fixed in populate_rankings_cache().
  
  The correct formula is the 3-tier blended breakeven:
    - 0 games played: use last5_avg (or last3_avg, last10_avg, projection_final as fallbacks)
    - 1-2 games played: 40% season_avg + 60% last5_avg blend
    - 3+ games played: season_avg

  ## Fix
  Replace the COALESCE(season_avg, projection_final, 0) fallback in the validator with
  the same blended formula used by populate_rankings_cache().

  ## Notes
  - This validator runs in Step 8b of run_neeko_pipeline() after the enrichment pass
  - It should only fire if the enrichment pass leaves NULL values (defensive fallback)
  - After FIX 2 (Step 8 now active), this validator should rarely need to repair anything
  - But if it does repair, it must use the correct blended formula to avoid re-introducing breakeven=0
*/

CREATE OR REPLACE FUNCTION afl.fn_validate_rankings_completeness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
v_null_projection  int;
v_null_breakeven   int;
v_null_value_score int;
v_repaired         int := 0;
v_batch            int := 0;
BEGIN
SELECT
COUNT(*) FILTER (WHERE projection_final      IS NULL),
COUNT(*) FILTER (WHERE breakeven_canonical   IS NULL),
COUNT(*) FILTER (WHERE value_score_canonical IS NULL)
INTO v_null_projection, v_null_breakeven, v_null_value_score
FROM afl.player_rankings_cache;

IF v_null_breakeven > 0 THEN
UPDATE afl.player_rankings_cache
SET breakeven_canonical = GREATEST(
  CASE
    WHEN COALESCE(games_played, 0) = 0 THEN
      COALESCE(last_5_avg, last_3_avg, projection_final, 60)
    WHEN COALESCE(games_played, 0) <= 2 THEN
      (0.4 * COALESCE(season_avg, 0) + 0.6 * COALESCE(last_5_avg, last_3_avg, season_avg, projection_final, 60))
    ELSE
      COALESCE(season_avg, projection_final, 60)
  END,
  0
),
breakeven = GREATEST(
  CASE
    WHEN COALESCE(games_played, 0) = 0 THEN
      COALESCE(last_5_avg, last_3_avg, projection_final, 60)
    WHEN COALESCE(games_played, 0) <= 2 THEN
      (0.4 * COALESCE(season_avg, 0) + 0.6 * COALESCE(last_5_avg, last_3_avg, season_avg, projection_final, 60))
    ELSE
      COALESCE(season_avg, projection_final, 60)
  END,
  0
)
WHERE breakeven_canonical IS NULL;
GET DIAGNOSTICS v_batch = ROW_COUNT;
v_repaired := v_repaired + v_batch;
END IF;

IF v_null_value_score > 0 THEN
UPDATE afl.player_rankings_cache
SET value_score_canonical = COALESCE(projection_final, 0) - GREATEST(COALESCE(breakeven_canonical, season_avg, 0), 0),
edge                  = COALESCE(projection_final, 0) - GREATEST(COALESCE(breakeven_canonical, season_avg, 0), 0)
WHERE value_score_canonical IS NULL;
GET DIAGNOSTICS v_batch = ROW_COUNT;
v_repaired := v_repaired + v_batch;
END IF;

IF v_null_projection > 0 THEN
UPDATE afl.player_rankings_cache
SET projection_final = COALESCE(season_avg, last_3_avg, last_5_avg, 60)
WHERE projection_final IS NULL;
GET DIAGNOSTICS v_batch = ROW_COUNT;
v_repaired := v_repaired + v_batch;
END IF;

IF v_null_projection > 0 OR v_null_breakeven > 0 OR v_null_value_score > 0 THEN
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
'rankings_completeness_failure',
'fn_validate_rankings_completeness',
'warning',
format(
'Rankings cache had null values — null_projection=%s null_breakeven=%s null_value_score=%s — repaired %s rows',
v_null_projection, v_null_breakeven, v_null_value_score, v_repaired
),
jsonb_build_object(
'null_projection',   v_null_projection,
'null_breakeven',    v_null_breakeven,
'null_value_score',  v_null_value_score,
'repaired_rows',     v_repaired,
'validated_at',      now()
)
);

RAISE WARNING 'Rankings completeness FAILED — null_projection=% null_breakeven=% null_value_score=% — % rows repaired',
v_null_projection, v_null_breakeven, v_null_value_score, v_repaired;
END IF;
END;
$function$;
