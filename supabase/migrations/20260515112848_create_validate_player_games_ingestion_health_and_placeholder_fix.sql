/*
  # Player Games Ingestion Health Validator + Placeholder Pattern Hardening

  ## Part 1: public.validate_player_games_ingestion_health()

  Read-only function that checks the health of the player_games ingestion pipeline
  across all completed AFL games. Returns a structured health report suitable for
  use in admin dashboards, pipeline guards, and automated monitoring.

  Returns a single JSON object with:
  - total_completed_games: FT games checked
  - critical_gap_count: FT games with raw rows but 0 player_games rows
  - high_gap_count: FT games with raw > player_games by more than 5 rows
  - medium_gap_count: games with placeholder names in raw or player_games
  - low_gap_count: games with minor row count mismatch (1-5)
  - placeholder_count: total placeholder player rows across raw_player_stats
  - games_with_raw_but_no_player_games: explicit CRITICAL list
  - games_with_player_games_mismatch: explicit HIGH list
  - pass: true only if critical_gap_count = 0 and high_gap_count = 0
  - details: full JSONB array of all non-OK gaps

  Does NOT mutate any data.

  ## Part 2: Placeholder pattern hardening

  Two functions still use the narrow ILIKE 'Player#%' pattern instead of the
  broadened SIMILAR TO 'Player[^A-Za-z]*[0-9]+%':

  1. public.sync_afl_player_identity — Steps 0, 1, 3, 4, 5, 6, 7 and the override guard
  2. afl.fn_guard_protected_player_identity — trigger override lookup and conflict log

  These are patched below. The broader pattern catches: Player#2098, Player 2098,
  Player2098, Player-2098, Player_2098, etc.

  ## Security
  validate_player_games_ingestion_health: SECURITY DEFINER, callable by authenticated
  and service_role, NOT anon.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: Health validator (read-only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_player_games_ingestion_health(
  p_season integer DEFAULT 2026
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_total_completed       integer := 0;
  v_critical_count        integer := 0;
  v_high_count            integer := 0;
  v_medium_count          integer := 0;
  v_low_count             integer := 0;
  v_placeholder_count     integer := 0;
  v_critical_game_ids     integer[] := '{}';
  v_high_game_ids         integer[] := '{}';
  v_details               jsonb := '[]'::jsonb;
  v_pass                  boolean;
  r                       record;
BEGIN
  -- Total FT games for season
  SELECT COUNT(*)::integer INTO v_total_completed
  FROM afl.games_raw
  WHERE season = p_season AND status_short = 'FT';

  -- Total placeholder player rows in raw_player_stats for season
  SELECT COUNT(DISTINCT player_id)::integer INTO v_placeholder_count
  FROM afl.raw_player_stats
  WHERE season = p_season
    AND player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%';

  -- Scan all FT games for gaps
  FOR r IN
    SELECT
      gr.game_id,
      gr.week,
      gr.season,
      gr.home_team_name,
      gr.away_team_name,
      COALESCE(raw_agg.raw_rows, 0)         AS raw_rows,
      COALESCE(pg_agg.pg_rows, 0)           AS pg_rows,
      COALESCE(raw_agg.raw_placeholders, 0) AS raw_placeholders,
      COALESCE(pg_agg.pg_placeholders, 0)   AS pg_placeholders
    FROM afl.games_raw gr
    LEFT JOIN (
      SELECT game_id,
             COUNT(*)::integer AS raw_rows,
             COUNT(*) FILTER (
               WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
             )::integer AS raw_placeholders
      FROM afl.raw_player_stats
      GROUP BY game_id
    ) raw_agg ON raw_agg.game_id = gr.game_id
    LEFT JOIN (
      SELECT game_id,
             COUNT(*)::integer AS pg_rows,
             COUNT(*) FILTER (
               WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
             )::integer AS pg_placeholders
      FROM afl.player_games
      GROUP BY game_id
    ) pg_agg ON pg_agg.game_id = gr.game_id
    WHERE gr.season = p_season
      AND gr.status_short = 'FT'
    ORDER BY gr.week, gr.game_id
  LOOP
    DECLARE
      v_severity text;
      v_action   text;
    BEGIN
      IF r.raw_rows > 0 AND r.pg_rows = 0 THEN
        v_severity := 'CRITICAL';
        v_action   := format('Call afl.fn_sync_player_games_from_raw() — game %s has %s raw rows but 0 player_games rows', r.game_id, r.raw_rows);
        v_critical_count := v_critical_count + 1;
        v_critical_game_ids := array_append(v_critical_game_ids, r.game_id);

      ELSIF r.raw_rows > r.pg_rows + 5 THEN
        v_severity := 'HIGH';
        v_action   := format('Call afl.fn_sync_player_games_from_raw() — %s rows missing for game %s', r.raw_rows - r.pg_rows, r.game_id);
        v_high_count := v_high_count + 1;
        v_high_game_ids := array_append(v_high_game_ids, r.game_id);

      ELSIF r.raw_placeholders > 0 OR r.pg_placeholders > 0 THEN
        v_severity := 'MEDIUM';
        v_action   := format('Resolve placeholders in game %s (raw=%s pg=%s)', r.game_id, r.raw_placeholders, r.pg_placeholders);
        v_medium_count := v_medium_count + 1;

      ELSIF r.raw_rows > r.pg_rows THEN
        v_severity := 'LOW';
        v_action   := format('Minor gap: %s row(s) missing for game %s', r.raw_rows - r.pg_rows, r.game_id);
        v_low_count := v_low_count + 1;

      ELSE
        CONTINUE;
      END IF;

      v_details := v_details || jsonb_build_object(
        'game_id',      r.game_id,
        'week',         r.week,
        'season',       r.season,
        'home',         r.home_team_name,
        'away',         r.away_team_name,
        'raw_rows',     r.raw_rows,
        'pg_rows',      r.pg_rows,
        'severity',     v_severity,
        'action',       v_action
      );
    END;
  END LOOP;

  v_pass := (v_critical_count = 0 AND v_high_count = 0);

  RETURN jsonb_build_object(
    'season',                           p_season,
    'pass',                             v_pass,
    'total_completed_games',            v_total_completed,
    'critical_gap_count',               v_critical_count,
    'high_gap_count',                   v_high_count,
    'medium_gap_count',                 v_medium_count,
    'low_gap_count',                    v_low_count,
    'placeholder_count',                v_placeholder_count,
    'games_with_raw_but_no_player_games', v_critical_game_ids,
    'games_with_player_games_mismatch', v_high_game_ids,
    'details',                          v_details,
    'checked_at',                       now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_player_games_ingestion_health(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_player_games_ingestion_health(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_player_games_ingestion_health(integer) TO service_role;

COMMENT ON FUNCTION public.validate_player_games_ingestion_health IS
'Read-only health check: detects FT games with raw_player_stats rows missing from player_games. Returns pass=true only if no CRITICAL or HIGH gaps exist. Safe to call at any time without side effects.';


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: Harden placeholder patterns in sync_afl_player_identity
-- Replace all ILIKE 'Player#%' with SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
-- so variants like Player 2098, Player2098, Player-2098 are caught.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_afl_player_identity(
  p_triggered_by text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'internal'
AS $$
DECLARE
  v_log_id              uuid;
  v_placeholder_before  integer := 0;
  v_placeholder_after   integer := 0;
  v_missing_before      integer := 0;
  v_missing_after       integer := 0;
  v_players_inserted    integer := 0;
  v_players_updated     integer := 0;
  v_overrides_applied   integer := 0;
  v_raw_updated         integer := 0;
  v_games_updated       integer := 0;
  v_overwrites_blocked  integer := 0;
  v_tmp                 integer := 0;
BEGIN
  -- ── Create audit log entry ─────────────────────────────────────────────────
  INSERT INTO public.player_identity_sync_log (triggered_by, validation_status, notes)
  VALUES (p_triggered_by, 'started', 'sync started')
  RETURNING id INTO v_log_id;

  -- ── Step 0: Snapshot pre-sync state ───────────────────────────────────────
  SELECT COUNT(DISTINCT player_id) INTO v_placeholder_before
  FROM afl.raw_player_stats
  WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%' AND season = 2026;

  SELECT COUNT(DISTINCT r.player_id) INTO v_missing_before
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL AND r.season = 2026;

  -- ── Step 1 (PRIORITY A+B): Apply ALL identity overrides first ─────────────
  INSERT INTO afl.players (player_id, player_name, position_group, active)
  SELECT
    o.player_id,
    o.player_name,
    COALESCE(o.position, (SELECT position_group FROM afl.players WHERE player_id = o.player_id)),
    true
  FROM afl.player_identity_overrides o
  WHERE o.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
  ON CONFLICT (player_id) DO UPDATE
  SET
    player_name    = EXCLUDED.player_name,
    position_group = COALESCE(EXCLUDED.position_group, afl.players.position_group),
    active         = EXCLUDED.active
  WHERE
    afl.players.player_name IS DISTINCT FROM EXCLUDED.player_name
    OR afl.players.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    OR afl.players.position_group IS DISTINCT FROM EXCLUDED.position_group;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_overrides_applied := v_tmp;

  -- ── Step 2 (PRIORITY C→D): Insert stub rows for unknown player_ids ─────────
  INSERT INTO afl.players (player_id, player_name, position_group, active)
  SELECT DISTINCT
    r.player_id,
    r.player_name,
    NULL,
    true
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL
    AND r.season = 2026
  ON CONFLICT (player_id) DO NOTHING;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_players_inserted := v_tmp;

  -- ── Step 3: Detect + log provider conflicts for protected players ──────────
  INSERT INTO afl.provider_conflict_log (
    player_id, canonical_name, provider_attempted, conflict_type,
    ingest_stage, season, week, team_name, raw_payload
  )
  SELECT DISTINCT ON (r.player_id, r.week)
    r.player_id,
    o.player_name                               AS canonical_name,
    r.player_name                               AS provider_attempted,
    CASE
      WHEN r.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%' THEN 'placeholder_attempt'
      ELSE 'name_mismatch'
    END                                          AS conflict_type,
    'raw_player_stats'                           AS ingest_stage,
    r.season,
    r.week,
    r.team_name,
    r.raw_json
  FROM afl.raw_player_stats r
  JOIN afl.player_identity_overrides o
    ON o.player_id    = r.player_id
   AND o.is_protected = true
   AND o.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
  WHERE r.season = 2026
    AND r.player_name IS DISTINCT FROM o.player_name
    AND NOT EXISTS (
      SELECT 1 FROM afl.provider_conflict_log cl
      WHERE cl.player_id         = r.player_id
        AND cl.provider_attempted = r.player_name
        AND cl.season             = r.season
        AND cl.week               = r.week
        AND cl.ingest_stage       = 'raw_player_stats'
    )
  ORDER BY r.player_id, r.week;

  GET DIAGNOSTICS v_overwrites_blocked = ROW_COUNT;

  -- ── Step 4: Propagate corrected names → afl.raw_player_stats ──────────────
  UPDATE afl.raw_player_stats r
  SET player_name = p.player_name
  FROM afl.players p
  WHERE p.player_id = r.player_id
    AND r.season = 2026
    AND p.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    AND p.player_name IS NOT NULL
    AND (
      r.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
      OR r.player_name IS DISTINCT FROM p.player_name
    );

  GET DIAGNOSTICS v_raw_updated = ROW_COUNT;

  -- ── Step 5: Propagate corrected names → afl.player_games ──────────────────
  UPDATE afl.player_games pg
  SET player_name = p.player_name
  FROM afl.players p
  WHERE p.player_id = pg.player_id
    AND pg.season = 2026
    AND p.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    AND p.player_name IS NOT NULL
    AND (
      pg.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
      OR pg.player_name IS DISTINCT FROM p.player_name
    );

  GET DIAGNOSTICS v_games_updated = ROW_COUNT;

  -- ── Step 6: Re-apply overrides (safety pass) ──────────────────────────────
  UPDATE afl.raw_player_stats r
  SET player_name = o.player_name
  FROM afl.player_identity_overrides o
  WHERE o.player_id   = r.player_id
    AND o.is_protected = true
    AND o.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    AND r.season       = 2026
    AND r.player_name IS DISTINCT FROM o.player_name;

  UPDATE afl.player_games pg
  SET player_name = o.player_name
  FROM afl.player_identity_overrides o
  WHERE o.player_id   = pg.player_id
    AND o.is_protected = true
    AND o.player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    AND pg.season      = 2026
    AND pg.player_name IS DISTINCT FROM o.player_name;

  -- ── Step 7: Snapshot post-sync state ──────────────────────────────────────
  SELECT COUNT(DISTINCT player_id) INTO v_placeholder_after
  FROM afl.raw_player_stats
  WHERE player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%' AND season = 2026;

  SELECT COUNT(DISTINCT r.player_id) INTO v_missing_after
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL AND r.season = 2026;

  v_players_updated := v_overrides_applied;

  -- ── Step 8: Update audit log ───────────────────────────────────────────────
  UPDATE public.player_identity_sync_log SET
    players_inserted             = v_players_inserted,
    players_updated              = v_players_updated,
    raw_stats_updated            = v_raw_updated,
    player_games_updated         = v_games_updated,
    placeholder_count_before     = v_placeholder_before,
    placeholder_count_after      = v_placeholder_after,
    missing_count_before         = v_missing_before,
    missing_count_after          = v_missing_after,
    correction_overrides_applied = v_overrides_applied,
    validation_status            = 'synced',
    notes                        = format(
      'sync complete — overrides=%s blocked=%s raw_updated=%s games_updated=%s',
      v_overrides_applied, v_overwrites_blocked, v_raw_updated, v_games_updated
    )
  WHERE id = v_log_id;

  -- ── Step 9: System log ─────────────────────────────────────────────────────
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'player_identity_sync', 'sync_afl_player_identity', 'info',
    format(
      'Identity sync complete: placeholders %s→%s missing %s→%s overrides=%s blocked=%s raw=%s games=%s',
      v_placeholder_before, v_placeholder_after,
      v_missing_before, v_missing_after,
      v_overrides_applied, v_overwrites_blocked,
      v_raw_updated, v_games_updated
    ),
    jsonb_build_object(
      'log_id',               v_log_id,
      'placeholder_before',   v_placeholder_before,
      'placeholder_after',    v_placeholder_after,
      'missing_before',       v_missing_before,
      'missing_after',        v_missing_after,
      'players_inserted',     v_players_inserted,
      'players_updated',      v_players_updated,
      'raw_stats_updated',    v_raw_updated,
      'player_games_updated', v_games_updated,
      'overrides_applied',    v_overrides_applied,
      'overwrites_blocked',   v_overwrites_blocked,
      'triggered_by',         p_triggered_by
    )
  );

  RETURN jsonb_build_object(
    'log_id',               v_log_id,
    'placeholder_before',   v_placeholder_before,
    'placeholder_after',    v_placeholder_after,
    'missing_before',       v_missing_before,
    'missing_after',        v_missing_after,
    'players_inserted',     v_players_inserted,
    'players_updated',      v_players_updated,
    'raw_stats_updated',    v_raw_updated,
    'player_games_updated', v_games_updated,
    'overrides_applied',    v_overrides_applied,
    'overwrites_blocked',   v_overwrites_blocked,
    'triggered_by',         p_triggered_by,
    'status',               'ok'
  );

EXCEPTION WHEN OTHERS THEN
  UPDATE public.player_identity_sync_log SET
    validation_status = 'error',
    notes             = 'EXCEPTION: ' || SQLERRM
  WHERE id = v_log_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('player_identity_sync_error', 'sync_afl_player_identity', 'error',
    'Player identity sync FAILED: ' || SQLERRM,
    jsonb_build_object('log_id', v_log_id, 'error', SQLERRM));
  RAISE;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2b: Harden afl.fn_guard_protected_player_identity trigger
-- Replace ILIKE 'Player#%' with SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.fn_guard_protected_player_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_override afl.player_identity_overrides%ROWTYPE;
BEGIN
  -- Look up whether this player has a protected override
  SELECT * INTO v_override
  FROM afl.player_identity_overrides
  WHERE player_id  = NEW.player_id
    AND is_protected = true
    AND player_name NOT SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
  LIMIT 1;

  -- No protection record — allow write through unchanged
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Provider is trying to overwrite with a different or placeholder name
  IF NEW.player_name IS DISTINCT FROM v_override.player_name THEN
    -- Log the attempted overwrite
    INSERT INTO afl.provider_conflict_log (
      player_id, canonical_name, provider_attempted,
      conflict_type, ingest_stage, raw_payload
    ) VALUES (
      NEW.player_id,
      v_override.player_name,
      NEW.player_name,
      CASE
        WHEN NEW.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
          THEN 'placeholder_attempt'
        ELSE 'name_mismatch'
      END,
      'afl_players',
      jsonb_build_object(
        'attempted_name',     NEW.player_name,
        'attempted_position', NEW.position_group,
        'canonical_name',     v_override.player_name,
        'trigger',            'fn_guard_protected_player_identity'
      )
    );

    -- Restore canonical name — provider cannot win
    NEW.player_name := v_override.player_name;
  END IF;

  -- Also protect position_group if override has one
  IF v_override.position IS NOT NULL
     AND NEW.position_group IS DISTINCT FROM v_override.position THEN
    NEW.position_group := v_override.position;
  END IF;

  RETURN NEW;
END;
$$;
