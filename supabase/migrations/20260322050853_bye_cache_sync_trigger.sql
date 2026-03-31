/*
  # Bye System Cache Sync Trigger

  ## Summary
  Creates a database-level safety trigger so that any direct UPDATE to
  `afl.team_byes` (is_bye_active or bye_round) automatically syncs
  `afl.player_rankings_cache.is_bye` for all players on that team.

  This is a defence-in-depth fallback — the `admin_toggle_team_bye` RPC
  already handles sync correctly. This trigger ensures cache integrity even
  if a raw SQL update is run directly.

  ## Changes
  - New trigger function: `afl.fn_sync_bye_to_rankings_cache()`
  - New trigger: `trg_bye_cache_sync` on `afl.team_byes` (AFTER UPDATE)

  ## Safety
  - FOR EACH ROW — fires per team row, not per player, so bulk updates remain efficient
  - Checks `OLD.is_bye_active IS DISTINCT FROM NEW.is_bye_active OR OLD.bye_round IS DISTINCT FROM NEW.bye_round`
    to short-circuit when irrelevant columns change
  - No recursion risk — trigger is on team_byes, UPDATE is on player_rankings_cache
*/

CREATE OR REPLACE FUNCTION afl.fn_sync_bye_to_rankings_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
BEGIN
  IF (OLD.is_bye_active IS DISTINCT FROM NEW.is_bye_active)
     OR (OLD.bye_round IS DISTINCT FROM NEW.bye_round)
  THEN
    UPDATE afl.player_rankings_cache
    SET is_bye = COALESCE(NEW.is_bye_active, FALSE)
    WHERE team_id = NEW.team_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bye_cache_sync ON afl.team_byes;

CREATE TRIGGER trg_bye_cache_sync
  AFTER UPDATE ON afl.team_byes
  FOR EACH ROW
  EXECUTE FUNCTION afl.fn_sync_bye_to_rankings_cache();
