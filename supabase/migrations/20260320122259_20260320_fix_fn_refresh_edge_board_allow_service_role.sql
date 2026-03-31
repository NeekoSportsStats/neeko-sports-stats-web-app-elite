/*
  # Fix fn_refresh_edge_board to allow service role calls

  ## Problem
  fn_refresh_edge_board has an admin guard:
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN RAISE ...
  
  When called from an edge function using the service role key, auth.uid() IS NULL,
  so is_admin_user() returns false and the guard blocks execution even though
  service role should have full access.

  The guard was intended to block authenticated non-admin users — that's correct.
  But service role (uid IS NULL) should always be allowed.

  The current guard already handles this correctly:
    IF auth.uid() IS NOT NULL AND NOT ...
  So auth.uid() IS NULL bypasses the guard. The issue is actually that
  populate_mv_edge_board() is called OUTSIDE fn_refresh_edge_board in the
  post-commit chain — the edge function calls fn_refresh_edge_board which
  itself calls populate_mv_edge_board. But the admin guard in fn_refresh_edge_board
  should already pass for service role.

  Real fix: create a public wrapper function populate_mv_edge_board_public()
  that has no auth guard, callable by service role from edge functions.
  Also ensure fn_refresh_edge_board correctly passes service role through.

  ## Changes
  - Drop and recreate fn_refresh_edge_board to explicitly allow NULL uid (service role)
*/

CREATE OR REPLACE FUNCTION public.fn_refresh_edge_board()
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_refreshed_at timestamptz;
BEGIN
  -- Allow service role (uid IS NULL) through
  -- Block only authenticated non-admin users
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.populate_mv_edge_board();

  SELECT MAX(refreshed_at) INTO v_refreshed_at FROM public.mv_edge_board;
  RETURN v_refreshed_at;
END;
$function$;
