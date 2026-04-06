/*
  # Security Fix: Revoke anon/authenticated access to admin and subscriber views

  ## Problem
  The following views expose sensitive subscriber and business data to ANY caller
  including unauthenticated (anon) users via the PostgREST API:

  - v_premium_users       → leaks email, stripe_customer_id, stripe_subscription_id
  - v_user_access         → leaks ALL billing fields (cancel dates, period end, price_id)
  - v_admin_revenue_summary → leaks MRR, ARR, subscriber counts
  - v_admin_analytics_7d  → leaks usage analytics and subscription count
  - v_admin_analytics_summary → leaks 24h usage analytics
  - v_admin_conversion_funnel → leaks conversion metrics
  - v_admin_subscription_metrics → leaks signup counts, churn data

  ## Fix
  Revoke SELECT from anon and authenticated roles on all these views.
  These views are only accessed by the admin panel via service_role or admin edge functions.
  service_role retains access (it bypasses RLS/grants entirely).

  ## Note
  Does NOT drop or alter the views themselves — only removes grants.
  No application logic changes needed: the admin panel calls these via
  service_role through edge functions, which is unaffected.
*/

-- Revoke from v_premium_users
REVOKE SELECT ON public.v_premium_users FROM anon;
REVOKE SELECT ON public.v_premium_users FROM authenticated;

-- Revoke from v_user_access
REVOKE SELECT ON public.v_user_access FROM anon;
REVOKE SELECT ON public.v_user_access FROM authenticated;

-- Revoke from v_admin_revenue_summary
REVOKE SELECT ON public.v_admin_revenue_summary FROM anon;
REVOKE SELECT ON public.v_admin_revenue_summary FROM authenticated;

-- Revoke from v_admin_analytics_7d
REVOKE SELECT ON public.v_admin_analytics_7d FROM anon;
REVOKE SELECT ON public.v_admin_analytics_7d FROM authenticated;

-- Revoke from v_admin_analytics_summary
REVOKE SELECT ON public.v_admin_analytics_summary FROM anon;
REVOKE SELECT ON public.v_admin_analytics_summary FROM authenticated;

-- Revoke from v_admin_conversion_funnel
REVOKE SELECT ON public.v_admin_conversion_funnel FROM anon;
REVOKE SELECT ON public.v_admin_conversion_funnel FROM authenticated;

-- Revoke from v_admin_subscription_metrics
REVOKE SELECT ON public.v_admin_subscription_metrics FROM anon;
REVOKE SELECT ON public.v_admin_subscription_metrics FROM authenticated;

-- Verify: log this security fix
INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
VALUES (
  'info',
  'security_hardening',
  'grant_revoke',
  'Revoked anon/authenticated SELECT on 7 admin/subscriber views',
  jsonb_build_object(
    'views_secured', ARRAY[
      'v_premium_users', 'v_user_access', 'v_admin_revenue_summary',
      'v_admin_analytics_7d', 'v_admin_analytics_summary',
      'v_admin_conversion_funnel', 'v_admin_subscription_metrics'
    ],
    'applied_at', now()
  )
);
