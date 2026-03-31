/*
  # Tighten grants on admin subscription views

  ## Problem
  v_user_access and v_admin_subscription_metrics had INSERT, UPDATE, DELETE, TRUNCATE,
  TRIGGER, and REFERENCES granted to both anon and authenticated roles — unnecessary and
  inconsistent with their read-only admin reporting purpose.

  ## Fix
  - Revoke all non-SELECT privileges from anon and authenticated on both views
  - Keep SELECT for authenticated (needed by admin UI queries)
  - Revoke SELECT from anon entirely (these views expose PII — email, subscription status)
  - service_role keeps full access (used by edge functions and service operations)

  ## Notes
  - Views backed by profiles (which has RLS) are naturally row-filtered for non-service callers
  - The admin UI calls these views server-side via service_role or authenticated admin session
  - Removing anon SELECT prevents accidental public exposure of subscriber PII
*/

-- ─── v_user_access ────────────────────────────────────────────────────────────

REVOKE ALL ON public.v_user_access FROM anon;
REVOKE ALL ON public.v_user_access FROM authenticated;

-- Admin UI reads this view as an authenticated admin user
GRANT SELECT ON public.v_user_access TO authenticated;


-- ─── v_admin_subscription_metrics ────────────────────────────────────────────

REVOKE ALL ON public.v_admin_subscription_metrics FROM anon;
REVOKE ALL ON public.v_admin_subscription_metrics FROM authenticated;

-- Admin UI reads this view as an authenticated admin user
GRANT SELECT ON public.v_admin_subscription_metrics TO authenticated;
