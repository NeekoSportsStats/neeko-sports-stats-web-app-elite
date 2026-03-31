/*
  # Align v_user_access and v_admin_subscription_metrics with get_access_state() RPC
  (Drop and recreate to allow column set changes)

  ## Summary
  Rebuilds both views so is_active uses the EXACT same 3-condition logic as the
  corrected get_access_state() RPC. Previously the view and RPC had divergent logic
  causing admin metrics to show different counts than what users actually experienced.

  ## v_user_access changes
  - is_active now requires billing_period_end > now() for Stripe condition (was missing)
  - Removes the old "subscription_status active/trialing with no expiry" shortcut
  - Adds is_stripe_active, is_manual_active, is_expiry_active for admin diagnostics
  - Adds is_canceled_still_active for "cancelled but paid window not expired" visibility
  - Exposes stripe_customer_id for admin cross-referencing

  ## v_admin_subscription_metrics changes
  - active_count now derives from corrected is_active — matches actual gating
  - Separates stripe_active_count, manual_active_count, expiry_active_count
  - Adds manual_premium_expired_count for housekeeping visibility
  - Keeps canceled_still_active for reporting

  ## Security
  - Grants tightened in a separate migration (Part 6)
*/

-- Drop dependent view first
DROP VIEW IF EXISTS public.v_admin_subscription_metrics;
DROP VIEW IF EXISTS public.v_user_access;


-- ─── v_user_access ───────────────────────────────────────────────────────────

CREATE VIEW public.v_user_access AS
SELECT
  p.id,
  p.email,
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.manual_premium_expires_at,
  p.stripe_customer_id,
  p.created_at,
  p.updated_at,

  -- Condition 1: Active Stripe subscription with valid billing period
  (
    p.subscription_status IN ('active', 'trialing')
    AND p.billing_period_end IS NOT NULL
    AND p.billing_period_end > now()
  ) AS is_stripe_active,

  -- Condition 2: Manual premium override
  (
    p.is_manual_premium = true
    AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > now())
  ) AS is_manual_active,

  -- Condition 3: Explicit premium_expires_at override
  (
    p.premium_expires_at IS NOT NULL
    AND p.premium_expires_at > now()
  ) AS is_expiry_active,

  -- Master is_active: mirrors get_access_state() exactly
  (
    (
      p.subscription_status IN ('active', 'trialing')
      AND p.billing_period_end IS NOT NULL
      AND p.billing_period_end > now()
    )
    OR (
      p.is_manual_premium = true
      AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > now())
    )
    OR (
      p.premium_expires_at IS NOT NULL
      AND p.premium_expires_at > now()
    )
  ) AS is_active,

  -- Cancelled in Stripe (may still be in paid window)
  (
    p.subscription_status IN ('canceled', 'cancelled')
  ) AS is_canceled,

  -- Cancelled in Stripe but billing period still in future (paid until date)
  (
    p.subscription_status IN ('canceled', 'cancelled')
    AND p.billing_period_end IS NOT NULL
    AND p.billing_period_end > now()
  ) AS is_canceled_still_active

FROM public.profiles p;


-- ─── v_admin_subscription_metrics ────────────────────────────────────────────

CREATE VIEW public.v_admin_subscription_metrics AS
SELECT
  count(*)                                                            AS total_profiles,
  count(*) FILTER (WHERE is_active = true)                           AS active_count,
  count(*) FILTER (WHERE is_stripe_active = true)                    AS stripe_active_count,
  count(*) FILTER (WHERE is_manual_active = true)                    AS manual_active_count,
  count(*) FILTER (WHERE is_expiry_active = true)                    AS expiry_active_count,
  count(*) FILTER (WHERE is_canceled_still_active = true)            AS canceled_still_active,
  count(*) FILTER (WHERE is_canceled = true AND is_active = false)   AS canceled_expired,
  count(*) FILTER (WHERE is_active = false)                          AS inactive_count,
  count(*) FILTER (WHERE
    is_manual_premium = true
    AND manual_premium_expires_at IS NOT NULL
    AND manual_premium_expires_at <= now()
  )                                                                   AS manual_premium_expired_count,
  count(*) FILTER (WHERE subscription_status IN ('active','trialing')) AS stripe_status_active_count,
  count(*) FILTER (WHERE subscription_status IN ('canceled','cancelled')) AS stripe_status_canceled_count,
  count(*) FILTER (WHERE created_at > now() - interval '24 hours')   AS signups_24h,
  count(*) FILTER (WHERE created_at > now() - interval '7 days')     AS signups_7d,
  count(*) FILTER (WHERE created_at > now() - interval '30 days')    AS signups_30d
FROM public.v_user_access;
