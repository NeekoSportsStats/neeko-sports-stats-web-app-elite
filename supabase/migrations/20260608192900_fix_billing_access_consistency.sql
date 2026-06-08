
-- ============================================================
-- Fix Billing/Access Consistency
--
-- Root cause: syncSubscriptionFromStripe() writes to subscriptions
-- but not profiles.billing_period_end. v_user_access only reads
-- profiles, so any user whose profiles row wasn't synced showed
-- is_active = false even with a valid subscription.
--
-- Changes:
-- 1. Backfill profiles from subscriptions for out-of-sync users
-- 2. Rebuild v_user_access with subscriptions safety net
-- 3. Rebuild v_premium_users to derive from v_user_access
-- ============================================================

-- ── 1. Backfill profiles from subscriptions ──────────────────
UPDATE public.profiles p
SET
  billing_period_end   = s.current_period_end,
  billing_period_start = s.current_period_start,
  subscription_status  = s.status,
  is_active            = (
    s.current_period_end IS NOT NULL
    AND s.current_period_end > now()
    AND s.status IN ('active', 'trialing', 'canceled', 'cancelled')
  ),
  updated_at           = now()
FROM (
  SELECT DISTINCT ON (COALESCE(profile_id, user_id))
    COALESCE(profile_id, user_id) AS uid,
    status,
    current_period_end,
    current_period_start
  FROM public.subscriptions
  WHERE status IN ('active', 'trialing', 'canceled', 'cancelled')
    AND current_period_end IS NOT NULL
  ORDER BY COALESCE(profile_id, user_id), updated_at DESC NULLS LAST
) s
WHERE p.id = s.uid
  AND (
    p.billing_period_end   IS DISTINCT FROM s.current_period_end
    OR p.subscription_status IS DISTINCT FROM s.status
    OR p.is_active IS DISTINCT FROM (
      s.current_period_end IS NOT NULL
      AND s.current_period_end > now()
      AND s.status IN ('active', 'trialing', 'canceled', 'cancelled')
    )
  );

-- ── 2. Rebuild v_user_access ──────────────────────────────────
-- The safety-net CTE joins subscriptions so is_active = true
-- even if profiles.billing_period_end was never synced.

DROP VIEW IF EXISTS public.v_user_access;

CREATE VIEW public.v_user_access AS
WITH latest_sub AS (
  SELECT DISTINCT ON (COALESCE(profile_id, user_id))
    COALESCE(profile_id, user_id) AS uid,
    status,
    current_period_end
  FROM public.subscriptions
  WHERE status IN ('active', 'trialing', 'canceled', 'cancelled')
    AND current_period_end IS NOT NULL
    AND current_period_end > now()
  ORDER BY COALESCE(profile_id, user_id), updated_at DESC NULLS LAST
)
SELECT
  p.id,
  p.email,
  p.subscription_status,
  p.stripe_customer_id,
  p.stripe_subscription_id,
  p.cancel_at_period_end,
  p.cancel_at,
  p.canceled_at,

  -- is_active: three conditions + subscriptions safety net
  CASE
    -- Manual premium always wins
    WHEN p.is_manual_premium = true
      AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > now())
      THEN true
    -- Profiles billing period valid (normal path after webhook sync)
    WHEN p.subscription_status IN ('active', 'trialing', 'canceled', 'cancelled')
      AND COALESCE(p.billing_period_end, p.premium_expires_at) IS NOT NULL
      AND COALESCE(p.billing_period_end, p.premium_expires_at) > now()
      THEN true
    -- Safety net: subscriptions table has a valid active row even if profiles is stale
    WHEN ls.uid IS NOT NULL
      THEN true
    ELSE false
  END AS is_active,

  CASE
    WHEN p.subscription_status = 'canceled' THEN true
    WHEN p.cancel_at_period_end = true THEN true
    ELSE false
  END AS is_canceled,

  CASE
    WHEN p.cancel_at_period_end = true
      AND p.subscription_status IN ('active', 'trialing')
      AND COALESCE(p.billing_period_end, p.premium_expires_at) IS NOT NULL
      AND COALESCE(p.billing_period_end, p.premium_expires_at) > now()
      THEN true
    ELSE false
  END AS is_cancelled_but_active,

  p.is_manual_premium,
  p.manual_premium_expires_at,
  p.billing_period_start,
  p.billing_period_end,
  p.premium_expires_at,
  p.created_at,
  p.updated_at,
  COALESCE(ss.price_id, p.stripe_subscription_id) AS price_id,
  ss.status AS stripe_subscription_status

FROM public.profiles p
LEFT JOIN latest_sub ls ON ls.uid = p.id
LEFT JOIN public.stripe_subscriptions ss
  ON ss.customer_id = p.stripe_customer_id
  AND ss.status IN ('active', 'trialing', 'canceled')
ORDER BY
  CASE WHEN p.subscription_status IN ('active', 'trialing') THEN 0 ELSE 1 END,
  COALESCE(p.billing_period_end, p.premium_expires_at) DESC NULLS LAST;

GRANT SELECT ON public.v_user_access TO authenticated;
GRANT SELECT ON public.v_user_access TO service_role;

-- ── 3. Rebuild v_premium_users from v_user_access ────────────
-- Previously read profiles.is_active (stored boolean) which could
-- disagree with v_user_access.is_active (computed). Now derives
-- directly from v_user_access so they are always identical.

DROP VIEW IF EXISTS public.v_premium_users;

CREATE VIEW public.v_premium_users AS
SELECT
  id,
  email,
  is_active,
  'premium'::text AS plan,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status,
  billing_period_end AS current_period_end
FROM public.v_user_access
WHERE is_active = true;

GRANT SELECT ON public.v_premium_users TO authenticated;
GRANT SELECT ON public.v_premium_users TO service_role;
