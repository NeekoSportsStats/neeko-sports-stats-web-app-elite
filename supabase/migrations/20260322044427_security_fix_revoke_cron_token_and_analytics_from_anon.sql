/*
  # Security Fix: Revoke dangerous RPC access from anon role

  ## Summary
  Revokes EXECUTE on functions that should never be callable by unauthenticated users:

  1. `get_cron_auth_token()` — CRITICAL: leaks live cron secret from internal.cron_secrets to any unauthenticated caller
  2. `get_analytics_daily()` — business analytics readable by anon
  3. `get_analytics_funnel_7d()` — business funnel data readable by anon
  4. `get_captain_recommendations_premium()` — premium-gated data readable by anon
  5. `get_access_state_for_user()` — any anon can query any user's subscription status by UUID

  ## Changes
  - REVOKE EXECUTE from `anon` and `public` on above functions
  - These functions are only called from the admin panel or authenticated contexts
  - No functionality is broken for legitimate authenticated/admin users
*/

REVOKE EXECUTE ON FUNCTION public.get_cron_auth_token() FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.get_analytics_daily(integer) FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.get_analytics_funnel_7d() FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.get_captain_recommendations_premium() FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.get_access_state_for_user(uuid) FROM anon, public;
