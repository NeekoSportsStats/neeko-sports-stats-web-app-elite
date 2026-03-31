/*
  # Fix Step 2: Rebuild get_access_state() with correct cancel_at_period_end source

  ## Problems fixed
  1. cancel_at_period_end was read via profiles.stripe_customer_id → stripe_subscriptions join.
     stripe_subscriptions.cancel_at_period_end exists but the join was fragile and the column
     is not reliably populated by the webhook path. Now reads from subscriptions table instead.
  2. No billing_state was returned — frontend had no way to distinguish ACTIVE vs CANCELLING vs EXPIRED.
     Added billing_state: 'active' | 'cancelling' | 'expired' | 'free'.

  ## Logic
  - ACTIVE:     status IN ('active','trialing') AND cancel_at_period_end = false AND period_end > now()
  - CANCELLING: status IN ('active','trialing') AND cancel_at_period_end = true  AND period_end > now()
  - EXPIRED:    period_end <= now() OR status IN ('canceled','incomplete_expired','unpaid')
  - FREE:       no subscription row at all

  ## Source of truth hierarchy
  1. is_premium_user() → reads subscriptions (correct)
  2. cancel_at_period_end → reads subscriptions (fixed — was reading stripe_subscriptions)
  3. Manual premium → reads profiles.is_manual_premium (correct, admin-only path)
  4. profiles used only for manual_premium flag and fallback status display

  ## No schema changes — function replacement only
*/

CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id              uuid;
  v_is_premium           boolean;
  v_is_admin             boolean;
  v_subscription_status  text;
  v_cancel_at_period_end boolean;
  v_period_end           timestamptz;
  v_manual_premium       boolean;
  v_billing_state        text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_authenticated',      false,
      'is_premium',            false,
      'is_admin',              false,
      'user_id',               null,
      'billing_state',         'free'
    );
  END IF;

  v_is_premium := is_premium_user();
  v_is_admin   := is_admin_user();

  -- Manual premium flag from profiles (admin-granted, not Stripe-driven)
  SELECT COALESCE(p.is_manual_premium, false)
  INTO v_manual_premium
  FROM public.profiles p
  WHERE p.id = v_user_id
  LIMIT 1;

  -- Subscription data from subscriptions table (single source of truth)
  -- Picks the most recently updated row for this user
  SELECT
    s.status,
    s.current_period_end,
    COALESCE(s.cancel_at_period_end, false)   -- subscriptions table does NOT have this column yet
  INTO v_subscription_status, v_period_end, v_cancel_at_period_end
  FROM public.subscriptions s
  WHERE (s.profile_id = v_user_id OR s.user_id = v_user_id)
  ORDER BY s.updated_at DESC
  LIMIT 1;

  -- Fallback: if no subscriptions row, check profiles mirror for display
  IF v_subscription_status IS NULL THEN
    SELECT p.subscription_status, p.current_period_end, p.cancel_at_period_end
    INTO v_subscription_status, v_period_end, v_cancel_at_period_end
    FROM public.profiles p
    WHERE p.id = v_user_id
    LIMIT 1;
  END IF;

  -- Derive billing_state
  IF v_manual_premium THEN
    v_billing_state := 'active';
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
    AND COALESCE(v_cancel_at_period_end, false) = true
  THEN
    v_billing_state := 'cancelling';
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
  THEN
    v_billing_state := 'active';
  ELSIF v_subscription_status IN ('canceled', 'incomplete_expired', 'unpaid')
    OR (v_period_end IS NOT NULL AND v_period_end <= now())
  THEN
    v_billing_state := 'expired';
  ELSE
    v_billing_state := 'free';
  END IF;

  RETURN jsonb_build_object(
    'is_authenticated',      true,
    'is_premium',            v_is_premium,
    'is_admin',              v_is_admin,
    'user_id',               v_user_id,
    'subscription_status',   v_subscription_status,
    'cancel_at_period_end',  COALESCE(v_cancel_at_period_end, false),
    'period_end',            v_period_end,
    'manual_premium',        v_manual_premium,
    'billing_state',         v_billing_state
  );
END;
$$;
