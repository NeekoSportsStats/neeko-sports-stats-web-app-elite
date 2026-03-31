/*
  # Revoke public execute on commit_price_round wrapper

  The public.commit_price_round function contains an is_admin_user() guard
  that fails when called via PostgREST with a user JWT (even from the edge
  function using service role key, PostgREST still resolves the calling user).

  The edge function now calls afl.commit_price_round directly using a
  service-role afl-schema client, bypassing this wrapper entirely.

  This migration revokes execute from anon and authenticated roles on the
  public wrapper to prevent any direct invocation.
*/

REVOKE EXECUTE ON FUNCTION public.commit_price_round(jsonb, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.commit_price_round(jsonb, integer, integer) FROM authenticated;
