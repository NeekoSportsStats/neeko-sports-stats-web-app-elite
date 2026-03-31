/*
  # Fix Access Logic: Cancelled Users Retain Access Until billing_period_end

  ## Summary
  Extends premium access logic so that users who cancel their Stripe subscription
  continue to have premium access until their billing_period_end date passes.

  ## Changes

  ### 1. get_access_state() RPC
  - Condition 1 now includes 'canceled' and 'cancelled' statuses alongside 'active'/'trialing'
  - Access is granted if billing_period_end is not null AND is in the future, regardless of cancellation
  - Manual premium and premium_expires_at logic unchanged

  ### 2. v_user_access view
  - is_stripe_active now includes canceled/cancelled with future billing_period_end
  - is_active matches the RPC logic exactly (single source of truth)
  - is_canceled: renamed from old implicit logic, now explicit column
  - is_canceled_still_active: was already present, now reflects correct logic
  - New column: is_cancelled_but_active (alias for admin clarity)

  ### 3. v_admin_subscription_metrics
  - active_count now includes cancelled-but-active users (driven by v_user_access.is_active)
  - canceled_but_active_count correctly counts canceled with future billing_period_end
  - expired_count excludes users still within billing period

  ## Important Notes
  1. No frontend changes required — all hooks consume is_premium from get_access_state()
  2. No Stripe checkout changes required
  3. Webhook fix is handled separately in the edge function
  4. The loophole guard remains: active status with NULL billing_period_end still denies access
*/

-- ============================================================
-- 1. Update get_access_state() RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id        uuid;
  v_is_premium     boolean := false;
  v_is_admin       boolean := false;
  v_sub_status     text    := null;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_premium', false, 'is_admin', false, 'subscription_status', null);
  END IF;

  SELECT
    (
      -- Condition 1: Stripe subscription with valid future billing period
      -- Includes canceled/cancelled — access runs until billing_period_end
      (
        p.subscription_status IN ('active', 'trialing', 'canceled', 'cancelled')
        AND p.billing_period_end IS NOT NULL
        AND p.billing_period_end > now()
      )
      OR
      -- Condition 2: Manual premium override (time-limited or permanent)
      (
        p.is_manual_premium = true
        AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > now())
      )
      OR
      -- Condition 3: Explicit premium expiry timestamp override
      (
        p.premium_expires_at IS NOT NULL
        AND p.premium_expires_at > now()
      )
    ),
    p.subscription_status,
    COALESCE(p.is_admin, false)
  INTO v_is_premium, v_sub_status, v_is_admin
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN jsonb_build_object(
    'is_premium',           COALESCE(v_is_premium, false),
    'is_admin',             COALESCE(v_is_admin,   false),
    'subscription_status',  v_sub_status
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'get_access_state() unexpected error for user %: % %', v_user_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('is_premium', false, 'is_admin', false, 'subscription_status', null);
END;
$$;

-- ============================================================
-- 2. Update v_user_access view
-- ============================================================
DROP VIEW IF EXISTS public.v_user_access CASCADE;

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

  -- Stripe condition: active/trialing/canceled with future billing period
  (
    p.subscription_status IN ('active', 'trialing', 'canceled', 'cancelled')
    AND p.billing_period_end IS NOT NULL
    AND p.billing_period_end > now()
  ) AS is_stripe_active,

  -- Manual premium condition
  (
    p.is_manual_premium = true
    AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > now())
  ) AS is_manual_active,

  -- Expiry override condition
  (
    p.premium_expires_at IS NOT NULL
    AND p.premium_expires_at > now()
  ) AS is_expiry_active,

  -- Master access flag — identical to get_access_state() Condition 1 OR 2 OR 3
  (
    (
      p.subscription_status IN ('active', 'trialing', 'canceled', 'cancelled')
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

  -- Cancellation flags (for admin visibility only — do not affect access logic)
  (
    p.subscription_status IN ('canceled', 'cancelled')
  ) AS is_canceled,

  -- Cancelled AND still within billing period (admin clarity)
  (
    p.subscription_status IN ('canceled', 'cancelled')
    AND p.billing_period_end IS NOT NULL
    AND p.billing_period_end > now()
  ) AS is_canceled_still_active,

  -- Alias for explicit admin UI readability
  (
    p.subscription_status IN ('canceled', 'cancelled')
    AND p.billing_period_end IS NOT NULL
    AND p.billing_period_end > now()
  ) AS is_cancelled_but_active

FROM public.profiles p;

-- Restore grants (view was dropped with CASCADE)
GRANT SELECT ON public.v_user_access TO authenticated;
GRANT SELECT ON public.v_user_access TO service_role;

-- ============================================================
-- 3. Update v_admin_subscription_metrics
-- ============================================================
DROP VIEW IF EXISTS public.v_admin_subscription_metrics;

CREATE VIEW public.v_admin_subscription_metrics AS
SELECT
  count(*)                                                                  AS total_profiles,

  -- Active = any user with current premium access (all 3 conditions)
  count(*) FILTER (WHERE is_active = true)                                  AS active_count,

  -- Stripe active strictly (active/trialing with future billing)
  count(*) FILTER (WHERE
    subscription_status IN ('active', 'trialing')
    AND billing_period_end IS NOT NULL
    AND billing_period_end > now()
  )                                                                          AS stripe_active_count,

  -- Manual premium active
  count(*) FILTER (WHERE is_manual_active = true)                           AS manual_active_count,

  -- premium_expires_at override active
  count(*) FILTER (WHERE is_expiry_active = true)                           AS expiry_active_count,

  -- Cancelled but still within billing period (paying until period end)
  count(*) FILTER (WHERE is_canceled_still_active = true)                   AS canceled_but_active_count,

  -- Cancelled AND billing period has expired (truly lapsed)
  count(*) FILTER (WHERE
    is_canceled = true
    AND (billing_period_end IS NULL OR billing_period_end <= now())
    AND is_manual_active = false
    AND is_expiry_active = false
  )                                                                          AS canceled_expired_count,

  -- Fully inactive (no access by any condition)
  count(*) FILTER (WHERE is_active = false)                                  AS inactive_count,

  -- Manual premium that has lapsed
  count(*) FILTER (WHERE
    is_manual_premium = true
    AND manual_premium_expires_at IS NOT NULL
    AND manual_premium_expires_at <= now()
  )                                                                          AS manual_premium_expired_count,

  -- Raw Stripe status counts
  count(*) FILTER (WHERE subscription_status IN ('active', 'trialing'))     AS stripe_status_active_count,
  count(*) FILTER (WHERE subscription_status IN ('canceled', 'cancelled'))  AS stripe_status_canceled_count,

  -- Signup cohorts
  count(*) FILTER (WHERE created_at > now() - interval '24 hours')         AS signups_24h,
  count(*) FILTER (WHERE created_at > now() - interval '7 days')           AS signups_7d,
  count(*) FILTER (WHERE created_at > now() - interval '30 days')          AS signups_30d

FROM public.v_user_access;

GRANT SELECT ON public.v_admin_subscription_metrics TO authenticated;
GRANT SELECT ON public.v_admin_subscription_metrics TO service_role;
