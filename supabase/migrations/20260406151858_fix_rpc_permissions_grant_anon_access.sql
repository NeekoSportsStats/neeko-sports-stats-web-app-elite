/*
  # Fix RPC Permissions — Grant anon Access to Safe RPCs

  ## Problem
  All 4 safe RPCs had REVOKE EXECUTE FROM anon applied, blocking
  frontend calls that use the anon key (unauthenticated / not logged in users).

  ## Fix
  Grant EXECUTE to anon on all safe RPCs. Functions are SECURITY DEFINER
  so they run with the definer's privileges — the anon role simply needs
  permission to invoke them.

  ## Functions
  - public.get_rankings_safe
  - public.get_market_watch_safe
  - public.get_edge_board_safe
  - public.get_player_detail_safe
*/

GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rankings_safe(uuid, boolean, int) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_market_watch_safe(uuid, boolean, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_market_watch_safe(uuid, boolean, int) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_edge_board_safe(uuid, boolean, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_edge_board_safe(uuid, boolean, int) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_player_detail_safe(text, uuid) TO authenticated;
