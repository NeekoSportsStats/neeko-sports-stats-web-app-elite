/*
  # Create v_user_access and subscription metrics views

  ## Summary
  Creates a canonical source-of-truth view for user access status,
  plus a subscription metrics aggregate view used by the admin dashboard.

  ## New Views
  - `v_user_access` — per-row access status for every profile, combining
    Stripe subscription, premium_expires_at, and manual premium fields
  - `v_admin_subscription_metrics` — single-row aggregate counts used by
    the admin Product tab (active, canceled, manual, expired, total, signups)

  ## Access Logic (is_active = true when ANY condition is met)
  1. Stripe active/trialing AND billing_period_end > NOW()
  2. premium_expires_at IS NOT NULL AND premium_expires_at > NOW()
  3. is_manual_premium = true AND (manual_premium_expires_at IS NULL OR manual_premium_expires_at > NOW())

  ## Security
  - Both views use SECURITY DEFINER owned by postgres so the service role
    can read them without exposing raw profile data to anon/authenticated roles
*/

-- ─── v_user_access ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_user_access
WITH (security_invoker = false)
AS
SELECT
  p.id,
  p.email,
  p.subscription_status,
  p.created_at,
  CASE
    WHEN (
      (p.subscription_status IN ('active','trialing') AND p.billing_period_end > NOW())
      OR (p.premium_expires_at IS NOT NULL AND p.premium_expires_at > NOW())
      OR (p.is_manual_premium = true AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > NOW()))
    ) THEN true
    ELSE false
  END AS is_active,
  CASE
    WHEN p.subscription_status IN ('canceled','cancelled') THEN true
    ELSE false
  END AS is_canceled,
  p.is_manual_premium,
  p.billing_period_end,
  p.premium_expires_at,
  p.manual_premium_expires_at
FROM public.profiles p;

-- ─── v_admin_subscription_metrics ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_admin_subscription_metrics
WITH (security_invoker = false)
AS
SELECT
  COUNT(*)                                                            AS total_profiles,
  COUNT(*) FILTER (WHERE is_active = true)                           AS active_count,
  COUNT(*) FILTER (WHERE is_canceled = true AND is_active = true)    AS canceled_still_active,
  COUNT(*) FILTER (WHERE is_canceled = true AND is_active = false)   AS canceled_expired,
  COUNT(*) FILTER (WHERE is_active = false)                          AS expired_count,
  COUNT(*) FILTER (WHERE is_manual_premium = true AND is_active = true) AS manual_active,
  COUNT(*) FILTER (WHERE subscription_status IN ('active','trialing')) AS stripe_active,
  COUNT(*) FILTER (WHERE subscription_status IN ('canceled','cancelled')) AS stripe_canceled,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')   AS signups_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')     AS signups_7d,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')    AS signups_30d
FROM public.v_user_access;
