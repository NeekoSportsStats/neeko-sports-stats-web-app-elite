/*
  # Fix get_access_state — cancelled-within-period billing state

  ## Problem
  When a Stripe subscription reaches its period end after cancellation, Stripe fires
  `customer.subscription.deleted` which sets status=canceled and cancel_at_period_end=false
  in our DB. The old `get_access_state` RPC derived `billing_state='expired'` for these users
  because it only recognised `billing_state='cancelling'` when `cancel_at_period_end=true`.

  This mismatched `is_premium_user()` which grants access based purely on period_end > now(),
  regardless of cancel_at_period_end. Users would see "expired" in the UI but still have access —
  confusing and misleading.

  ## Fix
  Unify: any canceled/cancelled subscription where `current_period_end > now()` gets
  `billing_state='cancelling'` (meaning "canceled but access still active until period ends").
  This matches what `is_premium_user()` computes.
*/

CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_plan_type            text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_authenticated', false,
      'is_premium',       false,
      'is_admin',         false,
      'user_id',          null,
      'billing_state',    'free',
      'plan_type',        null
    );
  END IF;

  v_is_premium := is_premium_user();
  v_is_admin   := is_admin_user();

  -- Manual premium flag
  SELECT COALESCE(p.is_manual_premium, false)
  INTO v_manual_premium
  FROM public.profiles p
  WHERE p.id = v_user_id
  LIMIT 1;

  -- Primary: read from subscriptions (source of truth), most recent row
  SELECT
    s.status,
    s.current_period_end,
    COALESCE(s.cancel_at_period_end, false),
    s.plan_type
  INTO v_subscription_status, v_period_end, v_cancel_at_period_end, v_plan_type
  FROM public.subscriptions s
  WHERE (s.profile_id = v_user_id OR s.user_id = v_user_id)
  ORDER BY s.updated_at DESC NULLS LAST
  LIMIT 1;

  -- Fallback: profiles mirror
  IF v_subscription_status IS NULL THEN
    SELECT
      p.subscription_status,
      COALESCE(p.current_period_end, p.billing_period_end, p.premium_expires_at),
      COALESCE(p.cancel_at_period_end, false)
    INTO v_subscription_status, v_period_end, v_cancel_at_period_end
    FROM public.profiles p
    WHERE p.id = v_user_id
    LIMIT 1;
  END IF;

  -- Derive billing_state
  -- Manual premium always wins
  IF v_manual_premium THEN
    v_billing_state := 'active';

  -- Active/trialing and scheduled to cancel → show as cancelling
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
    AND v_cancel_at_period_end = true
  THEN
    v_billing_state := 'cancelling';

  -- Active/trialing, no cancellation scheduled → fully active
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
  THEN
    v_billing_state := 'active';

  -- Canceled/cancelled but still within paid period → cancelling (access still active)
  ELSIF v_subscription_status IN ('canceled', 'cancelled')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
  THEN
    v_billing_state := 'cancelling';

  -- Fully expired or hard-failed
  ELSIF v_subscription_status IN ('canceled', 'incomplete_expired', 'unpaid')
    OR (v_period_end IS NOT NULL AND v_period_end <= now())
  THEN
    v_billing_state := 'expired';

  ELSE
    v_billing_state := 'free';
  END IF;

  RETURN jsonb_build_object(
    'is_authenticated',     true,
    'is_premium',           v_is_premium,
    'is_admin',             v_is_admin,
    'user_id',              v_user_id,
    'subscription_status',  v_subscription_status,
    'cancel_at_period_end', COALESCE(v_cancel_at_period_end, false),
    'period_end',           v_period_end,
    'manual_premium',       v_manual_premium,
    'billing_state',        v_billing_state,
    'plan_type',            v_plan_type
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'is_authenticated', true,
    'is_premium',       false,
    'is_admin',         false,
    'user_id',          v_user_id,
    'billing_state',    'free',
    'plan_type',        null
  );
END;
$$;
