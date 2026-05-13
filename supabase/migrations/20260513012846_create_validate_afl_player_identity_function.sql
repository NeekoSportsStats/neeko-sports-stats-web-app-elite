/*
  # Create validate_afl_player_identity() — Post-Sync Validation

  ## Purpose
  Runs AFTER sync_afl_player_identity() to confirm the identity sync worked
  and catch any remaining issues before the pipeline proceeds. Logs results
  back to player_identity_sync_log and system_logs.

  ## Checks performed
  1. Placeholder Player# names still in raw_player_stats (2026)
  2. NULL or blank player names in afl.players
  3. player_ids in raw_player_stats missing from afl.players
  4. player_ids in player_games missing from afl.players
  5. Known bad mappings (1846 still = Joel Freijah, etc.)
  6. Duplicate player_ids with conflicting names in afl.players
  7. player_ids with multiple distinct names across raw_player_stats

  ## Return
  Returns jsonb with validation_status ('pass'|'warn'|'fail') and all issues.
  Updates the most recent player_identity_sync_log row with results.
*/

CREATE OR REPLACE FUNCTION public.validate_afl_player_identity(
  p_log_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_issues        jsonb := '[]'::jsonb;
  v_issue_count   integer := 0;
  v_fatal_count   integer := 0;
  v_warn_count    integer := 0;
  v_status        text;
  v_log_id        uuid;
  v_tmp_count     integer;
BEGIN

  -- Find the most recent sync log to update (or use provided id)
  IF p_log_id IS NOT NULL THEN
    v_log_id := p_log_id;
  ELSE
    SELECT id INTO v_log_id
    FROM public.player_identity_sync_log
    ORDER BY run_at DESC
    LIMIT 1;
  END IF;

  -- ── Check 1: Placeholder names in raw_player_stats ──────────────────────
  SELECT COUNT(DISTINCT player_id) INTO v_tmp_count
  FROM afl.raw_player_stats
  WHERE player_name ILIKE 'Player#%' AND season = 2026;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'placeholder_in_raw_stats',
      'severity', 'warn',
      'count', v_tmp_count,
      'message', v_tmp_count || ' player_ids still have Player# placeholder names in raw_player_stats (2026). Names unknown — provider data needed.'
    ));
    v_warn_count := v_warn_count + 1;
  END IF;

  -- ── Check 2: NULL/blank names in afl.players ────────────────────────────
  SELECT COUNT(*) INTO v_tmp_count
  FROM afl.players
  WHERE player_name IS NULL OR trim(player_name) = '';

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'null_blank_names_in_players',
      'severity', 'fail',
      'count', v_tmp_count,
      'message', v_tmp_count || ' rows in afl.players have NULL or blank player_name'
    ));
    v_fatal_count := v_fatal_count + 1;
  END IF;

  -- ── Check 3: player_ids in raw_player_stats missing from afl.players ────
  SELECT COUNT(DISTINCT r.player_id) INTO v_tmp_count
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL AND r.season = 2026;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'raw_stats_missing_from_players',
      'severity', 'fail',
      'count', v_tmp_count,
      'message', v_tmp_count || ' player_ids appear in raw_player_stats but have no row in afl.players'
    ));
    v_fatal_count := v_fatal_count + 1;
  END IF;

  -- ── Check 4: player_ids in player_games missing from afl.players ─────────
  SELECT COUNT(DISTINCT pg.player_id) INTO v_tmp_count
  FROM afl.player_games pg
  LEFT JOIN afl.players p ON p.player_id = pg.player_id
  WHERE p.player_id IS NULL AND pg.season = 2026;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'player_games_missing_from_players',
      'severity', 'fail',
      'count', v_tmp_count,
      'message', v_tmp_count || ' player_ids appear in player_games but have no row in afl.players'
    ));
    v_fatal_count := v_fatal_count + 1;
  END IF;

  -- ── Check 5: Known bad mappings still present ────────────────────────────
  -- player_id 1846 should NOT still be named "Joel Freijah"
  IF EXISTS (
    SELECT 1 FROM afl.players
    WHERE player_id = 1846 AND player_name ILIKE '%Freijah%'
  ) THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'known_bad_mapping_1846',
      'severity', 'fail',
      'count', 1,
      'message', 'player_id 1846 is still mapped to Joel Freijah — emergency correction failed'
    ));
    v_fatal_count := v_fatal_count + 1;
  END IF;

  -- player_id 955 should exist in afl.players
  IF NOT EXISTS (SELECT 1 FROM afl.players WHERE player_id = 955) THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'missing_player_955',
      'severity', 'fail',
      'count', 1,
      'message', 'player_id 955 (Jamarra Ugle-Hagan) is still missing from afl.players'
    ));
    v_fatal_count := v_fatal_count + 1;
  END IF;

  -- ── Check 6: Duplicate player_ids in afl.players ─────────────────────────
  SELECT COUNT(*) INTO v_tmp_count
  FROM (
    SELECT player_id, COUNT(*) AS cnt
    FROM afl.players
    GROUP BY player_id
    HAVING COUNT(*) > 1
  ) dups;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'duplicate_player_ids',
      'severity', 'fail',
      'count', v_tmp_count,
      'message', v_tmp_count || ' player_ids appear more than once in afl.players (PK violation risk)'
    ));
    v_fatal_count := v_fatal_count + 1;
  END IF;

  -- ── Check 7: player_ids with multiple names in raw_player_stats ───────────
  SELECT COUNT(*) INTO v_tmp_count
  FROM (
    SELECT player_id
    FROM afl.raw_player_stats
    WHERE season = 2026
      AND player_name NOT ILIKE 'Player#%'
    GROUP BY player_id
    HAVING COUNT(DISTINCT player_name) > 1
  ) multi;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check', 'multi_name_player_ids',
      'severity', 'warn',
      'count', v_tmp_count,
      'message', v_tmp_count || ' player_ids have multiple distinct non-placeholder names in raw_player_stats — possible mid-season name correction or API collision'
    ));
    v_warn_count := v_warn_count + 1;
  END IF;

  -- ── Determine overall status ──────────────────────────────────────────────
  v_issue_count := v_fatal_count + v_warn_count;
  IF v_fatal_count > 0 THEN
    v_status := 'fail';
  ELSIF v_warn_count > 0 THEN
    v_status := 'warn';
  ELSE
    v_status := 'pass';
  END IF;

  -- ── Update audit log ──────────────────────────────────────────────────────
  IF v_log_id IS NOT NULL THEN
    UPDATE public.player_identity_sync_log SET
      validation_status = v_status,
      validation_issues = v_issues,
      notes             = 'validation complete: ' || v_status ||
                          ' (' || v_fatal_count || ' fatal, ' || v_warn_count || ' warn)'
    WHERE id = v_log_id;
  END IF;

  -- ── Log to system_logs ────────────────────────────────────────────────────
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'player_identity_validation',
    'validate_afl_player_identity',
    CASE WHEN v_status = 'fail' THEN 'error'
         WHEN v_status = 'warn' THEN 'warn'
         ELSE 'info' END,
    'Player identity validation: ' || v_status ||
      ' — ' || v_fatal_count || ' fatal, ' || v_warn_count || ' warn, ' || v_issue_count || ' total',
    jsonb_build_object(
      'log_id',       v_log_id,
      'status',       v_status,
      'fatal_count',  v_fatal_count,
      'warn_count',   v_warn_count,
      'issues',       v_issues
    )
  );

  -- ── Warn loudly if validation fails ──────────────────────────────────────
  IF v_status = 'fail' THEN
    RAISE WARNING 'PLAYER IDENTITY VALIDATION FAILED: % fatal issues detected. Pipeline proceeding with corrupted identity data. Check player_identity_sync_log for details.', v_fatal_count;
  END IF;

  RETURN jsonb_build_object(
    'validation_status', v_status,
    'fatal_count',       v_fatal_count,
    'warn_count',        v_warn_count,
    'issue_count',       v_issue_count,
    'issues',            v_issues,
    'log_id',            v_log_id
  );
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.validate_afl_player_identity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_afl_player_identity(uuid) TO service_role;
