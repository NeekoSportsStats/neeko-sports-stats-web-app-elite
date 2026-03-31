/*
  # Fix get_access_state() RPC — Canonical Subscription Logic

  ## Summary
  Replaces the broken get_access_state() RPC with a hardened version that:
  1. Removes the "subscription_status active/trialing without expiry" loophole
  2. Removes the fallback JOIN to stripe_subscriptions (table does not exist — caused runtime SQL errors)
  3. Adds a top-level EXCEPTION block so no DB error can ever break the auth session flow
  4. Uses exactly 3 conditions, consistently with the new v_user_access view

  ## Premium Logic (canonical)
  A user is premium if ANY of:
    1. Stripe active: subscription_status IN ('active','trialing')
       AND billing_period_end IS NOT NULL AND billing_period_end > now()
    2. Manual override: is_manual_premium = true
       AND (manual_premium_expires_at IS NULL OR manual_premium_expires_at > now())
    3. Explicit expiry override: premium_expires_at IS NOT NULL AND premium_expires_at > now()

  ## Removed
  - Old condition: subscription_status IN ('active','trialing') with no expiry check
  - Fallback JOIN to public.stripe_subscriptions (missing table → runtime SQL error)
  - Self-heal UPDATE that could silently grant access from a missing table

  ## Security
  - SECURITY DEFINER with explicit search_path
  - Returns {is_premium: false, is_admin: false} on any unexpected error — never breaks auth
*/

CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      -- Condition 1: Active Stripe subscription with valid billing period
      (
        p.subscription_status IN ('active', 'trialing')
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
    -- Never break auth flow — fail safe
    RAISE WARNING 'get_access_state() unexpected error for user %: % %', v_user_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('is_premium', false, 'is_admin', false, 'subscription_status', null);
END;
$$;
