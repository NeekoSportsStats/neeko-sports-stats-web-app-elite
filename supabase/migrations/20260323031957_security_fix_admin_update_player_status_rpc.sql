/*
  # Security Fix: Add DB-level admin guard to update_player_status

  ## Problem
  The `admin-command` edge function's `update_player_status` command performs
  direct service-role table writes on `afl.players` and `afl.player_rankings_cache`
  without any admin verification. Because service role bypasses RLS, any
  authenticated user who discovers the endpoint can change any player's manual_status.

  ## Fix
  Introduce a SECURITY DEFINER RPC `admin_update_player_status(p_player_id, p_status)`
  that:
  1. Checks `is_admin_user()` — identical guard used by all other admin RPCs
  2. Validates the status value against allowed enum
  3. Updates `afl.players.manual_status`
  4. Syncs `afl.player_rankings_cache.status` immediately
  5. Returns the updated player_id and status

  The edge function will be updated to call this RPC instead of performing
  direct table writes.

  ## Security Changes
  - New SECURITY DEFINER function: `public.admin_update_player_status`
  - Guards with `is_admin_user()` — same pattern as `admin_update_fantasy_prices`,
    `admin_toggle_team_bye`, `commit_price_round`, etc.
  - Enum validation prevents injection of arbitrary status strings
*/

CREATE OR REPLACE FUNCTION public.admin_update_player_status(
  p_player_id integer,
  p_status    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('OUT', 'INJURED', 'TEST') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be OUT, INJURED, TEST, or NULL', p_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE afl.players
  SET manual_status = p_status
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player % not found', p_player_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE afl.player_rankings_cache
  SET status = p_status
  WHERE player_id = p_player_id;

  RETURN jsonb_build_object(
    'player_id',     p_player_id,
    'manual_status', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_player_status(integer, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_player_status(integer, text) FROM anon;
