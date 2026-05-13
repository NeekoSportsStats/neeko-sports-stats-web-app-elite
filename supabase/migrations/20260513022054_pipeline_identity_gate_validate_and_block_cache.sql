/*
  # Pipeline Identity Gate — Block Public Cache on Corruption

  ## Summary
  Hardens the pipeline against identity corruption silently reaching the public cache.

  ### Changes

  1. `public.validate_afl_player_identity()` — rebuilt with severity tiers
     - Returns: status (ok/warn/fail), critical_count, high_count, medium_count,
       warn_count (legacy alias for medium+high), fatal_count (legacy alias for critical),
       issue_count, issues jsonb array (each item has check, severity, count, message)
     - FAIL triggers (block cache refresh and AI generation):
       a. active duplicate same-name/same-team players
       b. high-scoring Player# in player_rankings_cache (season_avg >= 40, games >= 2)
       c. raw_player_stats IDs missing from afl.players
       d. player_games IDs missing from afl.players
       e. known bad mapping: player_id 1846 still named Joel Freijah
       f. duplicate player_ids in afl.players (PK collision risk)
     - WARN only (pipeline continues):
       a. placeholder names in raw_player_stats (provider gap, expected)
       b. multi-name player_ids in raw_player_stats (minor correction noise)
       c. null/blank names in afl.players (medium severity — no active data risk)

  2. `public.run_neeko_pipeline()` — rebuilt with identity gate
     - After Step 0b validation: if status = 'fail', record identity_blocked steps
       for seed_rankings_cache (7b), refresh_rankings_cache (8), and
       trigger_generate_player_ai (9), then skip those steps.
     - Existing clean cache remains intact (no DELETE/TRUNCATE performed).
     - All other steps (projections, accuracy, market watch, edge board, etc.) continue.
     - Pipeline run finalises as 'identity_blocked' status (not 'error') so operators
       can distinguish identity failures from infra failures.
*/

-- =========================================================
-- 1. Rebuild validate_afl_player_identity() with severity tiers
-- =========================================================
CREATE OR REPLACE FUNCTION public.validate_afl_player_identity(p_log_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_issues          jsonb    := '[]'::jsonb;
  v_critical_count  integer  := 0;
  v_high_count      integer  := 0;
  v_medium_count    integer  := 0;
  v_warn_count      integer  := 0;  -- legacy alias: medium + high (non-critical blockers treated as warn internally)
  v_fatal_count     integer  := 0;  -- legacy alias: critical
  v_issue_count     integer  := 0;
  v_status          text;
  v_log_id          uuid;
  v_tmp_count       integer;
BEGIN

  -- Resolve log_id
  IF p_log_id IS NOT NULL THEN
    v_log_id := p_log_id;
  ELSE
    SELECT id INTO v_log_id
    FROM public.player_identity_sync_log
    ORDER BY run_at DESC
    LIMIT 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- FAIL CHECKS (critical — block cache refresh and AI generation)
  -- ──────────────────────────────────────────────────────────────────────────

  -- FAIL 1: Active duplicate same-name, same-team players
  -- Two distinct active player_ids sharing the same name within the same team
  -- creates ambiguous rankings/projection rows — corrupts cache output.
  SELECT COUNT(*) INTO v_tmp_count
  FROM (
    SELECT lower(trim(p.player_name)) AS norm_name, o.team_name
    FROM afl.players p
    JOIN afl.player_identity_overrides o ON o.player_id = p.player_id
    WHERE p.active = true
      AND p.player_name IS NOT NULL
      AND p.player_name NOT ILIKE 'Player#%'
    GROUP BY lower(trim(p.player_name)), o.team_name
    HAVING COUNT(DISTINCT p.player_id) > 1
  ) dups;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'active_duplicate_same_team',
      'severity', 'critical',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' active player name+team combinations have multiple distinct player_ids — cache will produce ambiguous rows'
    ));
    v_critical_count := v_critical_count + 1;
  END IF;

  -- FAIL 2: High-scoring Player# placeholder in player_rankings_cache
  -- avg >= 40 with >= 2 games means the unnamed player has real fantasy impact.
  SELECT COUNT(*) INTO v_tmp_count
  FROM public.player_rankings_cache
  WHERE player_name ILIKE 'Player#%'
    AND season_avg >= 40
    AND games_played >= 2;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'high_scoring_placeholder_in_cache',
      'severity', 'critical',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' Player# placeholders in player_rankings_cache have season_avg >= 40 and >= 2 games — corrupts public rankings'
    ));
    v_critical_count := v_critical_count + 1;
  END IF;

  -- FAIL 3: raw_player_stats IDs missing from afl.players
  SELECT COUNT(DISTINCT r.player_id) INTO v_tmp_count
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL AND r.season = 2026;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'raw_stats_missing_from_players',
      'severity', 'critical',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' player_ids in raw_player_stats (2026) have no row in afl.players — orphan data, projections will be wrong'
    ));
    v_critical_count := v_critical_count + 1;
  END IF;

  -- FAIL 4: player_games IDs missing from afl.players
  SELECT COUNT(DISTINCT pg.player_id) INTO v_tmp_count
  FROM afl.player_games pg
  LEFT JOIN afl.players p ON p.player_id = pg.player_id
  WHERE p.player_id IS NULL AND pg.season = 2026;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'player_games_missing_from_players',
      'severity', 'critical',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' player_ids in player_games (2026) have no row in afl.players — broken join chain'
    ));
    v_critical_count := v_critical_count + 1;
  END IF;

  -- FAIL 5: Known bad mapping — player_id 1846 still named Joel Freijah
  IF EXISTS (
    SELECT 1 FROM afl.players
    WHERE player_id = 1846 AND player_name ILIKE '%Freijah%'
  ) THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'known_bad_mapping_1846',
      'severity', 'critical',
      'count',    1,
      'message',  'player_id 1846 is still mapped to Joel Freijah — emergency identity correction has not been applied'
    ));
    v_critical_count := v_critical_count + 1;
  END IF;

  -- FAIL 6: Duplicate player_ids in afl.players (PK collision)
  SELECT COUNT(*) INTO v_tmp_count
  FROM (
    SELECT player_id FROM afl.players
    GROUP BY player_id HAVING COUNT(*) > 1
  ) dups;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'duplicate_player_ids_in_afl_players',
      'severity', 'critical',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' player_ids appear more than once in afl.players — PK integrity violation'
    ));
    v_critical_count := v_critical_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- WARN CHECKS (pipeline continues, but issues are logged)
  -- ──────────────────────────────────────────────────────────────────────────

  -- WARN 1: Placeholder names in raw_player_stats (expected — provider API gap)
  SELECT COUNT(DISTINCT player_id) INTO v_tmp_count
  FROM afl.raw_player_stats
  WHERE player_name ILIKE 'Player#%' AND season = 2026;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'placeholder_in_raw_stats',
      'severity', 'warn',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' player_ids still have Player# placeholder names in raw_player_stats (2026) — provider data gap, expected'
    ));
    v_warn_count := v_warn_count + 1;
  END IF;

  -- WARN 2: Null/blank player names in afl.players (no active stats risk normally)
  SELECT COUNT(*) INTO v_tmp_count
  FROM afl.players
  WHERE player_name IS NULL OR trim(player_name) = '';

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'null_blank_names_in_players',
      'severity', 'warn',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' rows in afl.players have NULL or blank player_name'
    ));
    v_warn_count := v_warn_count + 1;
  END IF;

  -- WARN 3: Multi-name player_ids in raw_player_stats (minor correction noise)
  SELECT COUNT(*) INTO v_tmp_count
  FROM (
    SELECT player_id
    FROM afl.raw_player_stats
    WHERE season = 2026 AND player_name NOT ILIKE 'Player#%'
    GROUP BY player_id
    HAVING COUNT(DISTINCT player_name) > 1
  ) multi;

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'multi_name_player_ids',
      'severity', 'warn',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' player_ids have multiple distinct non-placeholder names in raw_player_stats — possible mid-season correction'
    ));
    v_warn_count := v_warn_count + 1;
  END IF;

  -- WARN 4: Any Player# row in player_rankings_cache (low-scoring, below threshold)
  -- These are low-priority — they're placeholder but not impactful enough to block
  SELECT COUNT(*) INTO v_tmp_count
  FROM public.player_rankings_cache
  WHERE player_name ILIKE 'Player#%'
    AND (season_avg < 40 OR games_played < 2);

  IF v_tmp_count > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'check',    'low_score_placeholder_in_cache',
      'severity', 'warn',
      'count',    v_tmp_count,
      'message',  v_tmp_count || ' low-impact Player# placeholders in cache (avg < 40 or < 2 games) — not blocking but should be resolved'
    ));
    v_warn_count := v_warn_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Determine overall status
  -- ──────────────────────────────────────────────────────────────────────────
  v_fatal_count := v_critical_count;  -- legacy alias
  v_issue_count := v_critical_count + v_high_count + v_medium_count + v_warn_count;

  IF v_critical_count > 0 THEN
    v_status := 'fail';
  ELSIF v_warn_count > 0 OR v_high_count > 0 OR v_medium_count > 0 THEN
    v_status := 'warn';
  ELSE
    v_status := 'pass';
  END IF;

  -- Update sync log
  IF v_log_id IS NOT NULL THEN
    UPDATE public.player_identity_sync_log SET
      validation_status = v_status,
      validation_issues = v_issues,
      notes = 'validation: ' || v_status ||
              ' (' || v_critical_count || ' critical, ' || v_warn_count || ' warn)'
    WHERE id = v_log_id;
  END IF;

  -- Log to system_logs
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'player_identity_validation',
    'validate_afl_player_identity',
    CASE WHEN v_status = 'fail' THEN 'error' WHEN v_status = 'warn' THEN 'warn' ELSE 'info' END,
    'Player identity validation: ' || v_status ||
      ' — ' || v_critical_count || ' critical, ' || v_warn_count || ' warn, ' || v_issue_count || ' total',
    jsonb_build_object(
      'log_id',          v_log_id,
      'status',          v_status,
      'critical_count',  v_critical_count,
      'high_count',      v_high_count,
      'medium_count',    v_medium_count,
      'warn_count',      v_warn_count,
      'fatal_count',     v_fatal_count,
      'issues',          v_issues
    )
  );

  IF v_status = 'fail' THEN
    RAISE WARNING 'IDENTITY GATE: validation FAILED — % critical issues. Cache refresh and AI generation will be BLOCKED this pipeline run.', v_critical_count;
  END IF;

  RETURN jsonb_build_object(
    'validation_status', v_status,
    'status',            v_status,
    'critical_count',    v_critical_count,
    'high_count',        v_high_count,
    'medium_count',      v_medium_count,
    'warn_count',        v_warn_count,
    'fatal_count',       v_fatal_count,
    'issue_count',       v_issue_count,
    'issues',            v_issues,
    'log_id',            v_log_id
  );
END;
$$;

-- =========================================================
-- 2. Rebuild run_neeko_pipeline() with identity gate
--
-- Gate logic inserted after Step 0b:
--   v_identity_gate_fail := (v_validate_result->>'status' = 'fail')
--
-- Steps 7b (seed_rankings_cache), 8 (refresh_rankings_cache),
-- and 9 (trigger_generate_player_ai) are wrapped in an IF NOT gate check.
-- All other steps continue normally.
-- Pipeline finalises as 'identity_blocked' status when gated.
-- =========================================================
CREATE OR REPLACE FUNCTION public.run_neeko_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai', 'internal'
AS $$
DECLARE
  v_run_id              uuid        := gen_random_uuid();
  v_run_start           timestamptz := clock_timestamp();
  v_step_id             uuid;
  v_step_start          timestamptz;
  v_service_key         text;
  v_base_url            text;
  v_projection_result   text;
  v_result              jsonb := '[]'::jsonb;
  v_steps_ok            int   := 0;
  v_steps_err           int   := 0;
  v_steps_blocked       int   := 0;
  v_lock_acquired       boolean := false;
  v_enqueue_result      jsonb;
  v_identity_result     jsonb;
  v_validate_result     jsonb;
  v_identity_gate_fail  boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only'
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_lock_acquired := public.neeko_try_advisory_lock(1);
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'status',  'already_running',
      'message', 'Pipeline already running — advisory lock held by another session'
    );
  END IF;

  BEGIN

    BEGIN
      v_service_key := internal.get_cron_secret('supabase_secret_key');
    EXCEPTION WHEN OTHERS THEN
      SELECT value INTO v_service_key FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
    END;

    BEGIN
      v_base_url := internal.get_cron_secret('supabase_url');
    EXCEPTION WHEN OTHERS THEN
      SELECT value INTO v_base_url FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
    END;

    v_base_url := rtrim(COALESCE(v_base_url, 'https://zbomenuickrogthnsozb.supabase.co'), '/') || '/functions/v1';

    INSERT INTO public.pipeline_runs (
      id, pipeline_key, label, status,
      total_tasks, completed_tasks, current_step_label,
      started_at, finished_at
    ) VALUES (
      v_run_id, 'neeko_full_pipeline', 'Neeko Full Pipeline', 'running',
      28, 0, 'Starting', v_run_start, v_run_start
    ) ON CONFLICT DO NOTHING;

    -- ============================================================
    -- STEP 0a: Player identity sync
    -- ============================================================
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'sync_player_identity', 'Sync Player Identity', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      SELECT public.sync_afl_player_identity('pipeline') INTO v_identity_result;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer,
        error = v_identity_result::text WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Player identity synced' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'sync_player_identity', 'status', 'ok', 'detail', v_identity_result));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'sync_player_identity', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'sync_player_identity failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- ============================================================
    -- STEP 0b: Validate player identity — sets gate flag
    -- ============================================================
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'validate_player_identity', 'Validate Player Identity', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      SELECT public.validate_afl_player_identity() INTO v_validate_result;

      -- Engage identity gate if validation failed
      IF (v_validate_result->>'status') = 'fail' THEN
        v_identity_gate_fail := true;
      END IF;

      UPDATE public.pipeline_steps SET
        status = CASE WHEN v_identity_gate_fail THEN 'warn' ELSE 'success' END,
        completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer,
        error = CASE WHEN v_identity_gate_fail
          THEN 'IDENTITY GATE ENGAGED: ' || (v_validate_result->>'critical_count') || ' critical issues detected — cache refresh and AI generation are BLOCKED'
          ELSE v_validate_result::text
        END
      WHERE id = v_step_id;

      UPDATE public.pipeline_runs SET
        completed_tasks = completed_tasks + 1,
        current_step_label = 'Identity validated (' || COALESCE(v_validate_result->>'status', '?') || ')'
          || CASE WHEN v_identity_gate_fail THEN ' — GATE ENGAGED' ELSE '' END
      WHERE id = v_run_id;

      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'step',          'validate_player_identity',
        'status',        'ok',
        'validation',    v_validate_result,
        'gate_engaged',  v_identity_gate_fail
      ));

      IF v_identity_gate_fail THEN
        INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
        VALUES (
          'identity_gate_engaged',
          'cron:neeko_full_pipeline',
          'error',
          'IDENTITY GATE: ' || (v_validate_result->>'critical_count') ||
            ' critical issues detected. Steps seed_rankings_cache, refresh_rankings_cache, ' ||
            'and trigger_generate_player_ai are BLOCKED. Existing cache retained intact.',
          jsonb_build_object(
            'run_id',          v_run_id,
            'critical_count',  v_validate_result->'critical_count',
            'issues',          v_validate_result->'issues'
          )
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_player_identity', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'validate_player_identity failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 1: Player variation
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_variation', 'Refresh Player Variation', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_variation();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player variation refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_variation failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 2: Opponent concession
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_concession', 'Refresh Opponent Concession', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_opponent_concession();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Opponent concession refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_concession failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 3: Team game environment
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_team_game_environment', 'Refresh Team Game Environment', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_team_game_environment();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Team game environment refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_team_game_environment failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 4: Player role signals
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_role_signals', 'Refresh Player Role Signals', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_role_signals();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player role signals refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_role_signals', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_role_signals', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_role_signals failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 5: Breakout model
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_breakout_model', 'Refresh Breakout Model', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_breakout_model();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Breakout model refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_breakout_model', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_breakout_model', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_breakout_model failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 6: Venue concession
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_position_venue_concession', 'Refresh Venue Concession', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_opponent_position_venue_concession();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Venue concession refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_position_venue_concession', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_position_venue_concession', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_position_venue_concession failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 7: Rebuild player projection
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'rebuild_player_projection', 'Rebuild Player Projection', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      SELECT afl.rebuild_player_projection() INTO v_projection_result;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection rebuilt' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'ok', 'detail', v_projection_result));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'rebuild_player_projection failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- ============================================================
    -- STEP 7b: Seed rankings cache from MV
    -- IDENTITY GATE: blocked if validation_status = fail
    -- ============================================================
    IF NOT v_identity_gate_fail THEN
      v_step_start := clock_timestamp();
      BEGIN
        INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
        VALUES (gen_random_uuid(), v_run_id, 'seed_rankings_cache', 'Seed Rankings Cache', 'running', v_step_start)
        RETURNING id INTO v_step_id;
        PERFORM afl.fn_populate_player_rankings_cache();
        UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
          duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
        UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings cache seeded' WHERE id = v_run_id;
        v_steps_ok := v_steps_ok + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'seed_rankings_cache', 'status', 'ok'));
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
        v_steps_err := v_steps_err + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'seed_rankings_cache', 'status', 'error', 'msg', SQLERRM));
        INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'seed_rankings_cache failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
      END;
    ELSE
      -- Record blocked step
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at, completed_at, error)
      VALUES (gen_random_uuid(), v_run_id, 'seed_rankings_cache', 'Seed Rankings Cache', 'blocked',
              clock_timestamp(), clock_timestamp(),
              'IDENTITY GATE: skipped — ' || (v_validate_result->>'critical_count') || ' critical identity issues prevent cache refresh');
      v_steps_blocked := v_steps_blocked + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'seed_rankings_cache', 'status', 'blocked', 'reason', 'identity_gate'));
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Cache seed BLOCKED (identity gate)' WHERE id = v_run_id;
    END IF;

    -- ============================================================
    -- STEP 8: Enrichment pass on rankings cache
    -- IDENTITY GATE: blocked if validation_status = fail
    -- ============================================================
    IF NOT v_identity_gate_fail THEN
      v_step_start := clock_timestamp();
      BEGIN
        INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
        VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_start)
        RETURNING id INTO v_step_id;
        PERFORM afl.populate_rankings_cache_from_source();
        UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
          duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
        UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings cache refreshed' WHERE id = v_run_id;
        v_steps_ok := v_steps_ok + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'ok'));
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
        v_steps_err := v_steps_err + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'msg', SQLERRM));
        INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_rankings_cache failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
      END;
    ELSE
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at, completed_at, error)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'blocked',
              clock_timestamp(), clock_timestamp(),
              'IDENTITY GATE: skipped — cache enrichment blocked to preserve data integrity');
      v_steps_blocked := v_steps_blocked + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'blocked', 'reason', 'identity_gate'));
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Cache refresh BLOCKED (identity gate)' WHERE id = v_run_id;
    END IF;

    -- STEP 8b: Validate rankings completeness
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'validate_rankings_completeness', 'Validate Rankings Completeness', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.fn_validate_rankings_completeness();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings completeness validated' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_rankings_completeness', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_rankings_completeness', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'validate_rankings_completeness failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 8c: Mark player AI stale after stat change
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'mark_player_ai_stale_after_stat_change', 'Mark Player AI Stale After Stat Change', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      SELECT public.run_neeko_ai_enqueue() INTO v_enqueue_result;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer,
        error = v_enqueue_result::text WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Player AI stale rows marked — needs_regen queued' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_player_ai_stale_after_stat_change', 'status', 'ok', 'enqueue', v_enqueue_result));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_player_ai_stale_after_stat_change', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'mark_player_ai_stale_after_stat_change failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- ============================================================
    -- STEP 9: Trigger AI generation
    -- IDENTITY GATE: blocked if validation_status = fail
    -- ============================================================
    IF NOT v_identity_gate_fail THEN
      v_step_start := clock_timestamp();
      BEGIN
        INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
        VALUES (gen_random_uuid(), v_run_id, 'trigger_generate_player_ai', 'Trigger Generate Player AI', 'running', v_step_start)
        RETURNING id INTO v_step_id;
        IF v_service_key IS NOT NULL AND v_service_key != '' THEN
          PERFORM net.http_post(
            url     := v_base_url || '/generate-player-ai',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
            body    := '{}'::jsonb
          );
        END IF;
        UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
          duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
        UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI generation triggered' WHERE id = v_run_id;
        v_steps_ok := v_steps_ok + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'ok'));
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
        v_steps_err := v_steps_err + 1;
        v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'error', 'msg', SQLERRM));
        INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'trigger_generate_player_ai failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
      END;
    ELSE
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at, completed_at, error)
      VALUES (gen_random_uuid(), v_run_id, 'trigger_generate_player_ai', 'Trigger Generate Player AI', 'blocked',
              clock_timestamp(), clock_timestamp(),
              'IDENTITY GATE: AI generation blocked — generating content from corrupted identity data is not permitted');
      v_steps_blocked := v_steps_blocked + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'blocked', 'reason', 'identity_gate'));
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
        current_step_label = 'AI generation BLOCKED (identity gate)' WHERE id = v_run_id;
    END IF;

    -- STEP 10: Projection errors
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_projection_errors', 'Refresh Projection Errors', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_player_projection_error();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection errors refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_projection_errors', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_projection_errors', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_projection_errors failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 11: Model calibration
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_model_calibration', 'Refresh Model Calibration', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_model_calibration();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Model calibration refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_model_calibration', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_model_calibration', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_model_calibration failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 12: Calibrated confidence
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_calibrated_confidence', 'Refresh Calibrated Confidence', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_player_projection_confidence_calibrated();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Calibrated confidence refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_calibrated_confidence', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_calibrated_confidence', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_calibrated_confidence failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 13: Bias adjustments
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_bias_adjustments', 'Refresh Bias Adjustments', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_bias_adjustments();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Bias adjustments refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_bias_adjustments', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_bias_adjustments', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_bias_adjustments failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 14: Market watch snapshot
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'build_market_watch_snapshot', 'Build Market Watch Snapshot', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM market.build_market_watch_snapshot();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Market watch snapshot built' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'build_market_watch_snapshot', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'build_market_watch_snapshot', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'build_market_watch_snapshot failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 15: Snapshot projections
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'snapshot_projections', 'Snapshot Next Round Projections', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.snapshot_player_projections_for_next_round();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projections snapshotted' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'snapshot_projections', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'snapshot_projections', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'snapshot_projections failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 16: Edge board
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_edge_board', 'Refresh Edge Board', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.populate_mv_edge_board();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Edge board refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_edge_board', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_edge_board', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_edge_board failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 17: Consistency validation
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'validate_snapshot_consistency', 'Validate Snapshot Consistency', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_validate_snapshot_consistency();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Snapshot consistency validated' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_snapshot_consistency', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_snapshot_consistency', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'validate_snapshot_consistency failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 18: Fantasy market matches
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_fantasy_market_matches', 'Refresh Fantasy Market Matches', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_fantasy_market_matches();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Fantasy market matches refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_fantasy_market_matches failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 19: Model accuracy summary
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'log_model_accuracy_summary', 'Log Model Accuracy Summary', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_log_model_accuracy_summary();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Model accuracy logged' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'log_model_accuracy_summary', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'log_model_accuracy_summary', 'status', 'error', 'msg', SQLERRM));
    END;

    -- STEP 20: Accuracy metrics
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_accuracy_metrics', 'Refresh Accuracy Metrics', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_accuracy();
      PERFORM afl.fn_refresh_player_accuracy_metrics(p_season := EXTRACT(YEAR FROM NOW())::integer);
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Accuracy metrics refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_accuracy_metrics', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_accuracy_metrics', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
      ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_accuracy_metrics failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 21: Secondary AI regen pass
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'mark_players_needing_regen', 'AI Regen Health Check (Secondary Pass)', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM ai.fn_mark_players_needing_regen();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI regen health check passed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_players_needing_regen', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_players_needing_regen', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
      ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'mark_players_needing_regen failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 22: AI health guard
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'ai_health_guard', 'AI Health Guard', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_ai_health_guard();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI health guard checked' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'ai_health_guard', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'ai_health_guard', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
      ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'ai_health_guard failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 23: Pipeline completion check
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'pipeline_completion_check', 'Pipeline Completion Check', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_pipeline_completion_check(v_run_id);
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Completion check passed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'pipeline_completion_check', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'pipeline_completion_check', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
      ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'pipeline_completion_check failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- Finalise
    UPDATE public.pipeline_runs
    SET
      status             = CASE
        WHEN v_identity_gate_fail THEN 'identity_blocked'
        WHEN v_steps_err = 0      THEN 'complete'
        ELSE 'partial'
      END,
      current_step_label = CASE
        WHEN v_identity_gate_fail THEN 'Done (cache blocked — identity gate)'
        ELSE 'Done'
      END,
      finished_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_run_start) * 1000)::integer
    WHERE id = v_run_id;

    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'pipeline_complete', 'cron:neeko_full_pipeline',
      CASE WHEN v_identity_gate_fail THEN 'warn' ELSE 'info' END,
      'Neeko pipeline completed — steps_ok=' || v_steps_ok ||
        ' steps_err=' || v_steps_err ||
        ' steps_blocked=' || v_steps_blocked ||
        CASE WHEN v_identity_gate_fail THEN ' — IDENTITY GATE WAS ENGAGED (cache not refreshed)' ELSE '' END,
      jsonb_build_object(
        'run_id',            v_run_id,
        'steps_ok',          v_steps_ok,
        'steps_err',         v_steps_err,
        'steps_blocked',     v_steps_blocked,
        'identity_gate',     v_identity_gate_fail,
        'identity_issues',   COALESCE(v_validate_result->'critical_count', '0'::jsonb)
      )
    );

    PERFORM public.neeko_advisory_unlock(1);

    RETURN jsonb_build_object(
      'run_id',           v_run_id,
      'steps_ok',         v_steps_ok,
      'steps_err',        v_steps_err,
      'steps_blocked',    v_steps_blocked,
      'identity_gate',    v_identity_gate_fail,
      'steps',            v_result
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_runs
    SET status = 'error', current_step_label = 'Fatal error',
      finished_at = clock_timestamp()
    WHERE id = v_run_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
    ('pipeline_fatal_error', 'cron:neeko_full_pipeline', 'error',
     'Fatal pipeline error: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    PERFORM public.neeko_advisory_unlock(1);
    RAISE;
  END;

END;
$$;
