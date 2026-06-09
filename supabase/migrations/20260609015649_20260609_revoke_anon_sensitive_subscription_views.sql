-- Revoke anonymous and authenticated direct SELECT on sensitive subscription/admin views.
-- These views expose emails, billing state, and admin metrics.
-- All legitimate access paths already bypass these grants:
--   - Frontend: uses get_access_state() RPC (SECURITY DEFINER)
--   - Admin UI: uses admin-dashboard-data edge function (service_role key)
--   - Stripe webhook / edge functions: service_role bypasses RLS entirely
--   - is_premium_user(): SECURITY DEFINER, reads subscriptions directly
--   - Manual premium: SECURITY DEFINER function
--
-- service_role does NOT need explicit grants — it bypasses RLS and grant checks.

REVOKE SELECT ON public.v_user_access FROM anon;
REVOKE SELECT ON public.v_user_access FROM authenticated;

REVOKE SELECT ON public.v_premium_users FROM anon;
REVOKE SELECT ON public.v_premium_users FROM authenticated;

REVOKE SELECT ON public.v_admin_subscription_metrics FROM anon;
REVOKE SELECT ON public.v_admin_subscription_metrics FROM authenticated;
