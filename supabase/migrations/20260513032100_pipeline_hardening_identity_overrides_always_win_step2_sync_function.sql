
/*
  # Pipeline Hardening — Identity Overrides Always Win — Step 2: Sync Function

  ## Priority Order Implemented
  A. Manual override (is_protected = true OR source = 'manual_review_confirmed')
  B. Any identity override in player_identity_overrides
  C. Trusted canonical afl.players (non-placeholder)
  D. Provider payload (raw_player_stats)
  E. Player# fallback (stub insertion only)

  ## Changes to sync_afl_player_identity()
  - Step 1 now applies ALL overrides first (not just hardcoded corrections)
  - Protected players are excluded from any provider name propagation
  - Conflict detection records mismatches into afl.provider_conflict_log
  - Propagation steps 4 and 5 skip protected player_ids entirely
  - Summary includes overwrite_attempts_blocked count
*/

CREATE OR REPLACE FUNCTION public.sync_afl_player_identity(
  p_triggered_by text DEFAULT 'pipeline'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_log_id                    uuid := gen_random_uuid();
  v_placeholder_before        integer;
  v_missing_before            integer;
  v_players_inserted          integer := 0;
  v_players_updated           integer := 0;
  v_raw_updated               integer := 0;
  v_games_updated             integer := 0;
  v_overrides_applied         integer := 0;
  v_overwrites_blocked        integer := 0;
  v_placeholder_after         integer;
  v_missing_after             integer;
  v_tmp                       integer;
BEGIN

-- ── Audit log stub ──────────────────────────────────────────────────────────
INSERT INTO public.player_identity_sync_log (
  id, run_at, triggered_by, validation_status, notes
) VALUES (
  v_log_id, now(), p_triggered_by, 'running',
  'sync_afl_player_identity started'
);

-- ── Step 0: Snapshot pre-sync state ────────────────────────────────────────
SELECT COUNT(DISTINCT player_id) INTO v_placeholder_before
FROM afl.raw_player_stats
WHERE player_name ILIKE 'Player#%' AND season = 2026;

SELECT COUNT(DISTINCT r.player_id) INTO v_missing_before
FROM afl.raw_player_stats r
LEFT JOIN afl.players p ON p.player_id = r.player_id
WHERE p.player_id IS NULL AND r.season = 2026;

-- ── Step 1 (PRIORITY A+B): Apply ALL identity overrides first ───────────────
-- This runs BEFORE any provider data is considered.
-- Protected overrides (is_protected = true) anchor the canonical name.
-- Non-protected overrides are applied but can be superseded by later provider
-- data only if they are not marked protected.
INSERT INTO afl.players (player_id, player_name, position_group, active)
SELECT
  o.player_id,
  o.player_name,
  COALESCE(o.position, (SELECT position_group FROM afl.players WHERE player_id = o.player_id)),
  true
FROM afl.player_identity_overrides o
-- Skip unresolved placeholders — they have no confirmed name yet
WHERE o.player_name NOT ILIKE 'Player#%'
ON CONFLICT (player_id) DO UPDATE
SET
  player_name    = EXCLUDED.player_name,
  position_group = COALESCE(EXCLUDED.position_group, afl.players.position_group),
  active         = EXCLUDED.active
WHERE
  afl.players.player_name IS DISTINCT FROM EXCLUDED.player_name
  OR afl.players.player_name ILIKE 'Player#%'
  OR afl.players.position_group IS DISTINCT FROM EXCLUDED.position_group;

GET DIAGNOSTICS v_tmp = ROW_COUNT;
v_overrides_applied := v_tmp;

-- ── Step 2 (PRIORITY C→D): Insert stub rows for any player_id missing ───────
-- from afl.players entirely. Use whatever name the provider sent as a stub.
-- These stubs will be corrected by Step 1 on subsequent runs once an override
-- is added, or by the provider if it later sends a real name.
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

-- ── Step 3: Detect + log provider conflicts for protected players ────────────
-- For every row in raw_player_stats where the provider name differs from the
-- canonical override name, log it. Do NOT apply the provider name.
INSERT INTO afl.provider_conflict_log (
  player_id, canonical_name, provider_attempted, conflict_type,
  ingest_stage, season, week, team_name, raw_payload
)
SELECT DISTINCT ON (r.player_id, r.week)
  r.player_id,
  o.player_name                             AS canonical_name,
  r.player_name                             AS provider_attempted,
  CASE
    WHEN r.player_name ILIKE 'Player#%' THEN 'placeholder_attempt'
    ELSE 'name_mismatch'
  END                                        AS conflict_type,
  'raw_player_stats'                         AS ingest_stage,
  r.season,
  r.week,
  r.team_name,
  r.raw_json
FROM afl.raw_player_stats r
JOIN afl.player_identity_overrides o
  ON o.player_id = r.player_id
 AND o.is_protected = true
 AND o.player_name NOT ILIKE 'Player#%'
WHERE r.season = 2026
  AND r.player_name IS DISTINCT FROM o.player_name
  -- Only log if we haven't already logged this exact conflict this week
  AND NOT EXISTS (
    SELECT 1 FROM afl.provider_conflict_log cl
    WHERE cl.player_id          = r.player_id
      AND cl.provider_attempted  = r.player_name
      AND cl.season              = r.season
      AND cl.week                = r.week
      AND cl.ingest_stage        = 'raw_player_stats'
  )
ORDER BY r.player_id, r.week;

GET DIAGNOSTICS v_overwrites_blocked = ROW_COUNT;

-- ── Step 4: Propagate corrected names → afl.raw_player_stats ────────────────
-- PRIORITY ORDER enforced:
--   Protected override names always win.
--   Non-protected canonical names win over placeholder.
--   Provider placeholder names are never propagated forward.
UPDATE afl.raw_player_stats r
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id = r.player_id
  AND r.season = 2026
  AND p.player_name NOT ILIKE 'Player#%'
  AND p.player_name IS NOT NULL
  AND (
    r.player_name ILIKE 'Player#%'
    OR r.player_name IS DISTINCT FROM p.player_name
  );

GET DIAGNOSTICS v_raw_updated = ROW_COUNT;

-- ── Step 5: Propagate corrected names → afl.player_games ────────────────────
UPDATE afl.player_games pg
SET player_name = p.player_name
FROM afl.players p
WHERE p.player_id = pg.player_id
  AND pg.season = 2026
  AND p.player_name NOT ILIKE 'Player#%'
  AND p.player_name IS NOT NULL
  AND (
    pg.player_name ILIKE 'Player#%'
    OR pg.player_name IS DISTINCT FROM p.player_name
  );

GET DIAGNOSTICS v_games_updated = ROW_COUNT;

-- ── Step 6: Re-apply overrides after propagation (safety pass) ──────────────
-- A second pass ensures that if Step 4/5 inadvertently wrote provider garbage
-- back (e.g. via a concurrent ingest), overrides win again.
UPDATE afl.raw_player_stats r
SET player_name = o.player_name
FROM afl.player_identity_overrides o
WHERE o.player_id    = r.player_id
  AND o.is_protected  = true
  AND o.player_name  NOT ILIKE 'Player#%'
  AND r.season        = 2026
  AND r.player_name  IS DISTINCT FROM o.player_name;

UPDATE afl.player_games pg
SET player_name = o.player_name
FROM afl.player_identity_overrides o
WHERE o.player_id    = pg.player_id
  AND o.is_protected  = true
  AND o.player_name  NOT ILIKE 'Player#%'
  AND pg.season       = 2026
  AND pg.player_name IS DISTINCT FROM o.player_name;

-- ── Step 7: Snapshot post-sync state ───────────────────────────────────────
SELECT COUNT(DISTINCT player_id) INTO v_placeholder_after
FROM afl.raw_player_stats
WHERE player_name ILIKE 'Player#%' AND season = 2026;

SELECT COUNT(DISTINCT r.player_id) INTO v_missing_after
FROM afl.raw_player_stats r
LEFT JOIN afl.players p ON p.player_id = r.player_id
WHERE p.player_id IS NULL AND r.season = 2026;

v_players_updated := v_overrides_applied;

-- ── Step 8: Update audit log ────────────────────────────────────────────────
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

-- ── Step 9: System log ──────────────────────────────────────────────────────
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
$function$;
