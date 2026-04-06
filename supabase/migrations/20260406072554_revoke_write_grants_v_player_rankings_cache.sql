/*
  # Revoke Write Grants on v_player_rankings_cache

  The DROP/CREATE cycle re-granted default privileges. This migration
  explicitly revokes all write access from anon and authenticated roles.
  Views should never be writable via PostgREST.
*/

REVOKE DELETE, INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES
  ON public.v_player_rankings_cache
  FROM anon;

REVOKE DELETE, INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES
  ON public.v_player_rankings_cache
  FROM authenticated;
