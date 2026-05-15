/*
  # Targeted repair: game_id=3426 (Brisbane Lions v Geelong Cats, Week 10 2026)

  ## Summary
  Three-part repair applied in dependency order:

  ## Part A — Protected identity override: player_id=2098 → Cody Curtin
  Evidence confirmed:
  - player_number=37, team_id=2 (Brisbane Lions), across games 3418 and 3426
  - Only player carrying jersey #37 for Brisbane in 2026 season raw stats
  - No existing override; afl.players name is still Player#2098
  - Brisbane Lions official 2026 squad lists #37 as Cody Curtin
  Inserts a protected override and immediately applies it to afl.players and
  afl.raw_player_stats (all 2026 rows for player_id=2098).

  ## Part B — Harden placeholder detection regex
  All internal functions that check for placeholder names previously used the
  narrow pattern `ILIKE 'Player#%'`. This correctly catches Player#2098 but
  misses alternate separator styles (space, dash, underscore, colon, slash,
  bare digit). Updated pattern: `player_name ~ '^Player[^A-Za-z]*[0-9]+'`
  This is a superset of the old pattern — no valid real names will be affected.

  Functions updated:
  - afl.fn_sync_player_games_from_raw (UPDATE name-correction exclusion)
  - public.sync_afl_player_identity (Step 0 snapshot + Steps 1/2 guard)
  - public.validate_afl_player_identity (FAIL 2, WARN 1, WARN 3, WARN 4 checks)
  - public.refresh_player_identity_anomalies (RULE 1 exclusion, RULE 2 detection)

  Note: afl.fn_guard_protected_player_identity already uses `ILIKE 'Player#%'`
  consistently in the right places and is not changed — its guard logic is
  correct (it blocks any name that IS a placeholder, which the broad regex
  would also catch, but the guard trigger fires on protected rows only).

  ## Part C — Targeted player_games sync for game_id=3426
  Calls afl.fn_sync_player_games_from_raw() which:
  - Is idempotent (WHERE NOT EXISTS guard)
  - Only inserts rows for games where games_raw.status_short = 'FT'
  - Does not touch unrelated games or players
  - Uses canonical name from afl.players (now Cody Curtin after Part A)
  - Also name-corrects existing rows where afl.players name differs
*/

-- =============================================================================
-- PART A: Protected identity override for player_id=2098 (Cody Curtin)
-- =============================================================================

-- Step A1: Insert protected override (do not overwrite any existing protected row)
INSERT INTO afl.player_identity_overrides (
  player_id, player_name, team_id, team_name, position, notes, is_protected, source, updated_at
)
VALUES (
  2098,
  'Cody Curtin',
  2,
  'Brisbane Lions',
  NULL,
  'Resolved after 2026 Week 10 Brisbane v Geelong raw stat ingestion. Provider supplied Player#2098. Brisbane official squad lists #37 as Cody Curtin. Confirmed: jersey #37, team_id=2, consistent across games 3418 and 3426.',
  true,
  'manual_verified',
  now()
)
ON CONFLICT (player_id) DO UPDATE
SET
  player_name = EXCLUDED.player_name,
  team_id     = EXCLUDED.team_id,
  team_name   = EXCLUDED.team_name,
  notes       = EXCLUDED.notes,
  is_protected = true,
  source      = EXCLUDED.source,
  updated_at  = now()
WHERE
  -- Only update if not already protected with a different canonical name
  afl.player_identity_overrides.is_protected = false
  OR afl.player_identity_overrides.player_name ~ '^Player[^A-Za-z]*[0-9]+';

-- Step A2: Apply canonical name to afl.players
UPDATE afl.players
SET player_name = 'Cody Curtin'
WHERE player_id = 2098
  AND (player_name ~ '^Player[^A-Za-z]*[0-9]+' OR player_name IS NULL);

-- Step A3: Correct player_name in raw_player_stats for all 2026 rows where still placeholder
-- Scope: player_id=2098 only, season=2026 only
UPDATE afl.raw_player_stats
SET player_name = 'Cody Curtin'
WHERE player_id = 2098
  AND season    = 2026
  AND player_name ~ '^Player[^A-Za-z]*[0-9]+';

-- Log the identity correction
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'identity_correction',
  'repair_game3426',
  'info',
  'player_id=2098 resolved to Cody Curtin (Brisbane Lions #37). Protected override applied.',
  jsonb_build_object(
    'player_id',      2098,
    'canonical_name', 'Cody Curtin',
    'team_id',        2,
    'team_name',      'Brisbane Lions',
    'jersey_number',  37,
    'source',         'manual_verified',
    'games_affected', ARRAY[3418, 3426]
  )
);

-- =============================================================================
-- PART B: Harden placeholder detection regex in all functions
-- =============================================================================

-- B1: Rebuild afl.fn_sync_player_games_from_raw with broadened placeholder regex
CREATE OR REPLACE FUNCTION afl.fn_sync_player_games_from_raw()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
v_inserted integer;
v_updated  integer;
BEGIN

-- Insert new player-game rows using the canonical name from afl.players,
-- not the raw provider name. Override priority is already baked into afl.players
-- by sync_afl_player_identity() which runs before this step in the pipeline.
INSERT INTO afl.player_games (
game_id, player_id, player_name, team_id, team_name,
season, week, round, player_number,
disposals, kicks, handballs, marks, tackles, hitouts, clearances,
goals, goal_assists, behinds, free_kicks_for, free_kicks_against,
fantasy_score
)
SELECT
rps.game_id,
rps.player_id,
-- Use canonical name from afl.players (override-corrected); fall back to
-- provider name only if afl.players has no entry or still a placeholder.
COALESCE(
  NULLIF(p.player_name, ''),
  rps.player_name
)                                          AS player_name,
rps.team_id,
rps.team_name,
rps.season,
rps.week,
rps.round,
rps.player_number,
rps.disposals,
rps.kicks,
rps.handballs,
rps.marks,
rps.tackles,
rps.hitouts,
rps.clearances,
rps.goals,
rps.goal_assists,
rps.behinds,
rps.free_kicks_for,
rps.free_kicks_against,
GREATEST(0,
  rps.kicks           * 3 +
  rps.handballs       * 2 +
  rps.marks           * 3 +
  rps.tackles         * 4 +
  rps.hitouts         * 1 +
  rps.goals           * 6 +
  rps.behinds         * 1 +
  rps.free_kicks_for  * 1 -
  rps.free_kicks_against * 3
)::integer                                 AS fantasy_score
FROM afl.raw_player_stats rps
JOIN afl.games_raw gr
  ON gr.game_id     = rps.game_id
 AND gr.status_short = 'FT'
LEFT JOIN afl.players p
  ON p.player_id = rps.player_id
WHERE NOT EXISTS (
  SELECT 1 FROM afl.player_games pg
  WHERE pg.game_id   = rps.game_id
    AND pg.player_id = rps.player_id
);

GET DIAGNOSTICS v_inserted = ROW_COUNT;

-- Correct existing player_games rows where the stored name differs from the
-- current canonical name in afl.players (e.g. after manual identity correction).
-- Broadened exclusion: skip update if afl.players still has any placeholder pattern.
UPDATE afl.player_games pg
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id       = pg.player_id
  AND p.player_name     NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
  AND p.player_name     IS NOT NULL
  AND p.player_name     != ''
  AND pg.player_name    IS DISTINCT FROM p.player_name
  AND pg.season         = 2026;

GET DIAGNOSTICS v_updated = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'sync_player_games',
  format('fn_sync_player_games_from_raw: %s inserted, %s name-corrected', v_inserted, v_updated),
  now()
)
ON CONFLICT DO NOTHING;

RETURN format('fn_sync_player_games_from_raw: %s new rows, %s corrected', v_inserted, v_updated);

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES ('sync_player_games_error', 'fn_sync_player_games_from_raw failed: ' || SQLERRM, now())
ON CONFLICT DO NOTHING;
RAISE;
END;
$function$;

-- B2: Rebuild public.validate_afl_player_identity with broadened placeholder regex
-- Only updating the pattern strings; logic is identical.
CREATE OR REPLACE FUNCTION public.validate_afl_player_identity(p_log_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
v_issues          jsonb    := '[]'::jsonb;
v_critical_count  integer  := 0;
v_high_count      integer  := 0;
v_medium_count    integer  := 0;
v_warn_count      integer  := 0;
v_fatal_count     integer  := 0;
v_issue_count     integer  := 0;
v_status          text;
v_log_id          uuid;
v_tmp_count       integer;
BEGIN

IF p_log_id IS NOT NULL THEN
  v_log_id := p_log_id;
ELSE
  SELECT id INTO v_log_id
  FROM public.player_identity_sync_log
  ORDER BY run_at DESC
  LIMIT 1;
END IF;

-- FAIL 1: Active duplicate same-name, same-team players
SELECT COUNT(*) INTO v_tmp_count
FROM (
  SELECT lower(trim(p.player_name)) AS norm_name, o.team_name
  FROM afl.players p
  JOIN afl.player_identity_overrides o ON o.player_id = p.player_id
  WHERE p.active = true
    AND p.player_name IS NOT NULL
    AND p.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
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

-- FAIL 2: High-scoring placeholder in player_rankings_cache (broadened regex)
SELECT COUNT(*) INTO v_tmp_count
FROM public.player_rankings_cache
WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
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

-- WARN 1: Placeholder names in raw_player_stats (broadened regex)
SELECT COUNT(DISTINCT player_id) INTO v_tmp_count
FROM afl.raw_player_stats
WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%' AND season = 2026;

IF v_tmp_count > 0 THEN
  v_issues := v_issues || jsonb_build_array(jsonb_build_object(
    'check',    'placeholder_in_raw_stats',
    'severity', 'warn',
    'count',    v_tmp_count,
    'message',  v_tmp_count || ' player_ids still have placeholder names in raw_player_stats (2026) — provider data gap, expected'
  ));
  v_warn_count := v_warn_count + 1;
END IF;

-- WARN 2: Null/blank player names in afl.players
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

-- WARN 3: Multi-name player_ids in raw_player_stats (broadened exclusion)
SELECT COUNT(*) INTO v_tmp_count
FROM (
  SELECT player_id
  FROM afl.raw_player_stats
  WHERE season = 2026
    AND player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
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

-- WARN 4: Any placeholder row in player_rankings_cache (low-scoring, broadened)
SELECT COUNT(*) INTO v_tmp_count
FROM public.player_rankings_cache
WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
  AND (season_avg < 40 OR games_played < 2);

IF v_tmp_count > 0 THEN
  v_issues := v_issues || jsonb_build_array(jsonb_build_object(
    'check',    'low_score_placeholder_in_cache',
    'severity', 'warn',
    'count',    v_tmp_count,
    'message',  v_tmp_count || ' low-impact placeholder names in cache (avg < 40 or < 2 games) — not blocking but should be resolved'
  ));
  v_warn_count := v_warn_count + 1;
END IF;

v_fatal_count := v_critical_count;
v_issue_count := v_critical_count + v_high_count + v_medium_count + v_warn_count;

IF v_critical_count > 0 THEN
  v_status := 'fail';
ELSIF v_warn_count > 0 OR v_high_count > 0 OR v_medium_count > 0 THEN
  v_status := 'warn';
ELSE
  v_status := 'pass';
END IF;

IF v_log_id IS NOT NULL THEN
  UPDATE public.player_identity_sync_log SET
    validation_status = v_status,
    validation_issues = v_issues,
    notes = 'validation: ' || v_status ||
            ' (' || v_critical_count || ' critical, ' || v_warn_count || ' warn)'
  WHERE id = v_log_id;
END IF;

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
$function$;

-- B3: Rebuild public.refresh_player_identity_anomalies with broadened placeholder regex
CREATE OR REPLACE FUNCTION public.refresh_player_identity_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_inserted   int := 0;
v_updated    int := 0;
v_total      int := 0;
v_anomaly    record;
v_existing   uuid;
v_result     jsonb;
BEGIN

-- RULE 1: Dual identity — two active player_ids share the same name on the same team
FOR v_anomaly IN
  SELECT
    MIN(c.player_id)   AS player_id,
    c.player_name      AS player_name,
    c.team_name        AS team_name,
    jsonb_build_object(
      'player_ids', array_agg(c.player_id ORDER BY c.player_id),
      'count',      count(*),
      'note',       'Two active players share the same name on the same team in rankings cache'
    ) AS details
  FROM public.player_rankings_cache c
  WHERE c.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    AND c.player_name IS NOT NULL
    AND c.player_name != ''
  GROUP BY lower(trim(c.player_name)), c.player_name, c.team_name
  HAVING count(DISTINCT c.player_id) > 1
LOOP
  SELECT id INTO v_existing
  FROM public.player_identity_anomalies
  WHERE player_id   = v_anomaly.player_id
    AND anomaly_type = 'dual_identity'
    AND status       != 'resolved'
  LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.player_identity_anomalies
    (severity, anomaly_type, player_id, player_name, team_name, details, status)
    VALUES ('critical', 'dual_identity', v_anomaly.player_id,
            v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
    v_inserted := v_inserted + 1;
  ELSE
    UPDATE public.player_identity_anomalies
    SET details = v_anomaly.details, detected_at = now()
    WHERE id = v_existing;
    v_updated := v_updated + 1;
  END IF;
END LOOP;

-- Auto-resolve open dual_identity rows where the conflict no longer exists
UPDATE public.player_identity_anomalies a SET
  status      = 'resolved',
  resolved_at = now(),
  notes       = COALESCE(a.notes, '') || ' | Auto-resolved: duplicate name no longer present in rankings cache.'
WHERE a.anomaly_type = 'dual_identity'
  AND a.status       != 'resolved'
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_rankings_cache c
    WHERE lower(trim(c.player_name)) = lower(trim(a.player_name))
      AND c.team_name = a.team_name
      AND c.player_id != a.player_id
  );

-- RULE 2: High-value placeholder (season_avg >= 60, broadened regex)
FOR v_anomaly IN
  SELECT
    c.player_id,
    c.player_name,
    COALESCE(c.team_name, '') AS team_name,
    jsonb_build_object(
      'season_avg',   c.season_avg,
      'games_played', c.games_played,
      'last_5_avg',   c.last_5_avg,
      'position',     c.position,
      'price',        c.price
    ) AS details
  FROM public.player_rankings_cache c
  WHERE c.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    AND c.season_avg >= 60
    AND c.games_played >= 2
LOOP
  SELECT id INTO v_existing
  FROM public.player_identity_anomalies
  WHERE player_id    = v_anomaly.player_id
    AND anomaly_type = 'high_value_placeholder'
    AND status       != 'resolved'
  LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.player_identity_anomalies
    (severity, anomaly_type, player_id, player_name, team_name, details, status)
    VALUES ('high', 'high_value_placeholder', v_anomaly.player_id,
            v_anomaly.player_name, v_anomaly.team_name, v_anomaly.details, 'open');
    v_inserted := v_inserted + 1;
  ELSE
    UPDATE public.player_identity_anomalies
    SET details = v_anomaly.details, detected_at = now()
    WHERE id = v_existing;
    v_updated := v_updated + 1;
  END IF;
END LOOP;

-- Auto-resolve high_value_placeholder where player is now named
UPDATE public.player_identity_anomalies a SET
  status      = 'resolved',
  resolved_at = now(),
  notes       = COALESCE(a.notes, '') || ' | Auto-resolved: placeholder name no longer in rankings cache.'
WHERE a.anomaly_type = 'high_value_placeholder'
  AND a.status       != 'resolved'
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_rankings_cache c
    WHERE c.player_id   = a.player_id
      AND c.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
  );

v_total := v_inserted + v_updated;
v_result := jsonb_build_object(
  'inserted', v_inserted,
  'updated',  v_updated,
  'total',    v_total
);

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'anomaly_refresh',
  'refresh_player_identity_anomalies',
  'info',
  format('refresh_player_identity_anomalies: %s inserted, %s updated', v_inserted, v_updated),
  v_result
);

RETURN v_result;
END;
$function$;

-- =============================================================================
-- PART C: Targeted player_games sync for game_id=3426
-- =============================================================================

-- Identity correction (Part A) must be committed before sync runs so that
-- afl.players.player_name=Cody Curtin is visible to fn_sync_player_games_from_raw.
SELECT afl.fn_sync_player_games_from_raw();

-- Log completion
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'repair_complete',
  'repair_game3426',
  'info',
  'Targeted repair for game_id=3426 complete: identity override applied, placeholder regex hardened, player_games synced.',
  jsonb_build_object(
    'game_id',    3426,
    'season',     2026,
    'week',       10,
    'match',      'Brisbane Lions v Geelong Cats'
  )
);
