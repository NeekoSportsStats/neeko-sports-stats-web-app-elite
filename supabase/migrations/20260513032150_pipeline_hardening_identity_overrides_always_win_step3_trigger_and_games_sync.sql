
/*
  # Pipeline Hardening — Identity Overrides Always Win — Step 3: Trigger + Games Sync

  ## Changes
  1. afl.players BEFORE UPDATE trigger — if an incoming write would overwrite a
     protected player's name with a placeholder or different value, silently
     restore the canonical override name and log the conflict instead.

  2. Rebuild afl.fn_sync_player_games_from_raw() — use canonical name from
     afl.players (which now always reflects override priority) rather than
     the raw provider name from raw_player_stats.
*/

-- ─── Trigger function: protect afl.players from bad provider writes ───────────

CREATE OR REPLACE FUNCTION afl.fn_guard_protected_player_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_override afl.player_identity_overrides%ROWTYPE;
BEGIN
  -- Look up whether this player has a protected override
  SELECT * INTO v_override
  FROM afl.player_identity_overrides
  WHERE player_id  = NEW.player_id
    AND is_protected = true
    AND player_name NOT ILIKE 'Player#%'
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
      CASE WHEN NEW.player_name ILIKE 'Player#%' THEN 'placeholder_attempt' ELSE 'name_mismatch' END,
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
  IF v_override.position IS NOT NULL AND NEW.position_group IS DISTINCT FROM v_override.position THEN
    NEW.position_group := v_override.position;
  END IF;

  RETURN NEW;
END;
$function$;

-- Attach trigger to afl.players — fires on every INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_guard_protected_player_identity ON afl.players;

CREATE TRIGGER trg_guard_protected_player_identity
  BEFORE INSERT OR UPDATE OF player_name, position_group
  ON afl.players
  FOR EACH ROW
  EXECUTE FUNCTION afl.fn_guard_protected_player_identity();

-- ─── Rebuild fn_sync_player_games_from_raw to use canonical names ─────────────
-- Previously it copied player_name straight from raw_player_stats (provider).
-- Now it resolves the name via afl.players (which has already been corrected
-- by overrides before this function runs in the pipeline).

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

  -- Also correct any existing player_games rows where the stored name
  -- differs from the current canonical name in afl.players (e.g. after a
  -- manual identity correction was applied after games were already synced).
  UPDATE afl.player_games pg
  SET player_name = p.player_name
  FROM afl.players p
  WHERE p.player_id       = pg.player_id
    AND p.player_name     NOT ILIKE 'Player#%'
    AND p.player_name     IS NOT NULL
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

-- ─── Grant admin RPC access to provider_conflict_log ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_provider_conflict_log(p_limit int DEFAULT 100)
RETURNS TABLE (
  detected_at        timestamptz,
  player_id          integer,
  canonical_name     text,
  provider_attempted text,
  conflict_type      text,
  ingest_stage       text,
  season             integer,
  week               integer,
  team_name          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  SELECT
    detected_at, player_id, canonical_name, provider_attempted,
    conflict_type, ingest_stage, season, week, team_name
  FROM afl.provider_conflict_log
  ORDER BY detected_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_provider_conflict_log(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_conflict_log(int) TO authenticated;
