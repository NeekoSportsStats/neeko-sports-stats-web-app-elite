/*
  # Fix Pipeline: Create public.refresh_player_rankings_cache wrapper

  ## Summary
  The run_afl_pipeline_controller_internal function calls public.refresh_player_rankings_cache()
  but this function only exists in the afl schema. This migration creates a public schema
  wrapper that delegates to afl.refresh_player_rankings_cache(), resolving the pipeline error.

  ## Changes
  - Creates public.refresh_player_rankings_cache() as a wrapper around afl.refresh_player_rankings_cache()
  - Grants EXECUTE to authenticated and service_role

  ## Notes
  - This is the source of the "column created_at does not exist" error — the public version
    was missing, causing PostgreSQL to fall back to a stale/wrong code path
  - The afl version correctly calls afl.populate_rankings_cache_from_source() which handles
    the created_at column properly
*/

CREATE OR REPLACE FUNCTION public.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache_from_source();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_player_rankings_cache() TO authenticated, service_role;
