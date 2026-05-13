/*
  # Create sync_afl_player_identity() — Canonical Player Identity Sync

  ## Purpose
  Runs BEFORE fn_sync_player_games_from_raw() and before any projection/cache
  refresh. Ensures afl.players, afl.raw_player_stats, and afl.player_games all
  carry correct player names before downstream canonicalisation.

  ## What it does
  1. Records pre-sync placeholder/missing counts for audit log
  2. Applies hardcoded emergency corrections for confirmed bad IDs:
     - player_id 1846: wrongly stored as "Joel Freijah" → Riley Thilthorpe (FWD, Adelaide)
     - player_id 955:  missing entirely → Jamarra Ugle-Hagan (FWD, Gold Coast Suns)
  3. Applies any rows in afl.player_identity_overrides as trusted corrections
  4. Inserts placeholder stub rows into afl.players for any player_id seen in
     raw_player_stats that is still missing (prevents further Player# fallbacks)
  5. Propagates corrected names downstream to raw_player_stats and player_games
  6. Records post-sync counts and returns a jsonb audit summary

  ## Emergency corrections table
  The hardcoded corrections below are the source of truth until the API provides
  reliable player name data. Add new rows to the CORRECTIONS CTE as needed.

  ## Security
  SECURITY DEFINER — callable by pipeline (service_role cron) and admin.
*/

CREATE OR REPLACE FUNCTION public.sync_afl_player_identity(
  p_triggered_by text DEFAULT 'pipeline'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_log_id                    uuid := gen_random_uuid();
  v_placeholder_before        integer;
  v_missing_before            integer;
  v_players_inserted          integer := 0;
  v_players_updated           integer := 0;
  v_raw_updated               integer := 0;
  v_games_updated             integer := 0;
  v_overrides_applied         integer := 0;
  v_placeholder_after         integer;
  v_missing_after             integer;
  v_tmp                       integer;
BEGIN

  -- ── Insert audit log stub ──────────────────────────────────────────────────
  INSERT INTO public.player_identity_sync_log (
    id, run_at, triggered_by, validation_status, notes
  ) VALUES (
    v_log_id, now(), p_triggered_by, 'running',
    'sync_afl_player_identity started'
  );

  -- ── Step 0: Snapshot pre-sync state ───────────────────────────────────────
  SELECT COUNT(DISTINCT player_id) INTO v_placeholder_before
  FROM afl.raw_player_stats
  WHERE player_name ILIKE 'Player#%' AND season = 2026;

  SELECT COUNT(DISTINCT r.player_id) INTO v_missing_before
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL AND r.season = 2026;

  -- ── Step 1: Apply hardcoded emergency corrections to afl.players ──────────
  -- These are confirmed bad mappings from the AFL API that must be corrected
  -- regardless of what the API sends. Update this list as new ones are found.
  --
  -- Format: (player_id, correct_name, position_group, is_active)
  WITH corrections (player_id, player_name, position_group, active) AS (
    VALUES
      -- player_id 1846: API/seed data wrongly used "Joel Freijah" for this ID.
      -- Real Joel Freijah is player_id 1807 (Western Bulldogs). This ID belongs
      -- to Riley Thilthorpe (Adelaide Crows, FWD/RUC).
      (1846, 'Riley Thilthorpe', 'FWD', true),
      -- player_id 955: Jamarra Ugle-Hagan, returned from injury in Week 7 2026.
      -- Was completely missing from afl.players causing Player#955 fallback.
      (955, 'Jamarra Ugle-Hagan', 'FWD', true)
  )
  INSERT INTO afl.players (player_id, player_name, position_group, active)
  SELECT c.player_id, c.player_name, c.position_group, c.active
  FROM corrections c
  ON CONFLICT (player_id) DO UPDATE
    SET player_name    = EXCLUDED.player_name,
        position_group = EXCLUDED.position_group,
        active         = EXCLUDED.active
  WHERE
    -- Only update if the name is wrong or it was a placeholder
    afl.players.player_name IS DISTINCT FROM EXCLUDED.player_name
    OR afl.players.player_name ILIKE 'Player#%'
    OR afl.players.active IS DISTINCT FROM EXCLUDED.active;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_overrides_applied := v_tmp;

  -- ── Step 2: Apply afl.player_identity_overrides (operator-managed) ─────────
  INSERT INTO afl.players (player_id, player_name, position_group, active)
  SELECT o.player_id, o.player_name,
         COALESCE(o.position, (SELECT position_group FROM afl.players WHERE player_id = o.player_id)),
         true
  FROM afl.player_identity_overrides o
  ON CONFLICT (player_id) DO UPDATE
    SET player_name    = EXCLUDED.player_name,
        position_group = COALESCE(EXCLUDED.position_group, afl.players.position_group),
        active         = EXCLUDED.active
  WHERE afl.players.player_name IS DISTINCT FROM EXCLUDED.player_name
     OR afl.players.player_name ILIKE 'Player#%';

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_overrides_applied := v_overrides_applied + v_tmp;

  -- ── Step 3: Insert stub rows for any player_id still missing from afl.players
  -- This prevents the Player#N fallback from recurring next run.
  -- The stub uses the placeholder name — still bad, but at least tracked.
  -- Real names will be resolved by Step 1/2 corrections or future data.
  INSERT INTO afl.players (player_id, player_name, position_group, active)
  SELECT DISTINCT
    r.player_id,
    r.player_name,  -- still placeholder — we insert so the foreign key resolves
    NULL,
    true
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL
    AND r.season = 2026
  ON CONFLICT (player_id) DO NOTHING;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_players_inserted := v_tmp;

  -- Track total new vs updated
  -- (overrides_applied already counts upserts above)
  v_players_updated := v_overrides_applied;

  -- ── Step 4: Propagate corrected names → afl.raw_player_stats ──────────────
  UPDATE afl.raw_player_stats r
  SET player_name = p.player_name
  FROM afl.players p
  WHERE p.player_id = r.player_id
    AND r.season = 2026
    AND (
      r.player_name ILIKE 'Player#%'
      OR r.player_name IS DISTINCT FROM p.player_name
    )
    AND p.player_name NOT ILIKE 'Player#%'
    AND p.player_name IS NOT NULL;

  GET DIAGNOSTICS v_raw_updated = ROW_COUNT;

  -- ── Step 5: Propagate corrected names → afl.player_games ──────────────────
  UPDATE afl.player_games pg
  SET player_name = p.player_name
  FROM afl.players p
  WHERE p.player_id = pg.player_id
    AND pg.season = 2026
    AND (
      pg.player_name ILIKE 'Player#%'
      OR pg.player_name IS DISTINCT FROM p.player_name
    )
    AND p.player_name NOT ILIKE 'Player#%'
    AND p.player_name IS NOT NULL;

  GET DIAGNOSTICS v_games_updated = ROW_COUNT;

  -- ── Step 6: Snapshot post-sync state ──────────────────────────────────────
  SELECT COUNT(DISTINCT player_id) INTO v_placeholder_after
  FROM afl.raw_player_stats
  WHERE player_name ILIKE 'Player#%' AND season = 2026;

  SELECT COUNT(DISTINCT r.player_id) INTO v_missing_after
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  WHERE p.player_id IS NULL AND r.season = 2026;

  -- ── Step 7: Update audit log ───────────────────────────────────────────────
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
    notes                        = 'sync complete — validation pending'
  WHERE id = v_log_id;

  -- ── Step 8: Log to system_logs ─────────────────────────────────────────────
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'player_identity_sync', 'sync_afl_player_identity', 'info',
    'Player identity sync complete: ' ||
      'placeholders ' || v_placeholder_before || '→' || v_placeholder_after ||
      ' missing ' || v_missing_before || '→' || v_missing_after ||
      ' raw_updated=' || v_raw_updated ||
      ' games_updated=' || v_games_updated ||
      ' overrides=' || v_overrides_applied,
    jsonb_build_object(
      'log_id',                    v_log_id,
      'placeholder_before',        v_placeholder_before,
      'placeholder_after',         v_placeholder_after,
      'missing_before',            v_missing_before,
      'missing_after',             v_missing_after,
      'players_inserted',          v_players_inserted,
      'players_updated',           v_players_updated,
      'raw_stats_updated',         v_raw_updated,
      'player_games_updated',      v_games_updated,
      'correction_overrides',      v_overrides_applied,
      'triggered_by',              p_triggered_by
    )
  );

  RETURN jsonb_build_object(
    'log_id',                    v_log_id,
    'placeholder_before',        v_placeholder_before,
    'placeholder_after',         v_placeholder_after,
    'missing_before',            v_missing_before,
    'missing_after',             v_missing_after,
    'players_inserted',          v_players_inserted,
    'players_updated',           v_players_updated,
    'raw_stats_updated',         v_raw_updated,
    'player_games_updated',      v_games_updated,
    'correction_overrides',      v_overrides_applied,
    'triggered_by',              p_triggered_by,
    'status',                    'ok'
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

-- Grant execute to service_role (cron) only
REVOKE ALL ON FUNCTION public.sync_afl_player_identity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_afl_player_identity(text) TO service_role;
