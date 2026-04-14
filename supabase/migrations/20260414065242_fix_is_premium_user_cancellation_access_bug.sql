/*
  # Fix is_premium_user — cancellation access bug

  ## Problem
  When a weekly subscriber cancels, Stripe sends `customer.subscription.updated` with
  `cancel_at_period_end=true, status=active`. Later, when the period ends, Stripe fires
  `customer.subscription.deleted` with `status=canceled, cancel_at_period_end=false`.

  The old `is_premium_user` only granted access to a canceled sub if `cancel_at_period_end=true`.
  But by the time status becomes `canceled`, Stripe has already set `cancel_at_period_end=false`.
  This meant users lost access IMMEDIATELY when their status flipped to `canceled`, even if
  `current_period_end` was still in the future.

  ## Fix
  Grant access whenever `current_period_end > now()` AND status is either:
  - active/trialing (normal active subscription)
  - canceled/cancelled BUT still within the paid period (regardless of cancel_at_period_end)

  This correctly handles the full Stripe cancellation lifecycle:
  1. Active: status=active, cancel_at_period_end=false → ACCESS
  2. Cancel scheduled: status=active, cancel_at_period_end=true → ACCESS
  3. Period still running after cancel: status=canceled, period_end > now() → ACCESS (FIXED)
  4. Fully expired: status=canceled, period_end <= now() → NO ACCESS
*/

CREATE OR REPLACE FUNCTION public.is_premium_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_manual_premium boolean;
  v_manual_expires timestamptz;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check manual_premium flag (admin-granted access)
  SELECT
    COALESCE(is_manual_premium, false),
    manual_premium_expires_at
  INTO v_manual_premium, v_manual_expires
  FROM public.profiles
  WHERE id = v_user_id
  LIMIT 1;

  IF v_manual_premium AND (v_manual_expires IS NULL OR v_manual_expires > now()) THEN
    RETURN true;
  END IF;

  -- Source of truth: subscriptions table
  -- Grant access if current_period_end is in the future AND:
  --   A) status is active/trialing (normal active subscription), OR
  --   B) status is canceled/cancelled but still within the paid period
  --      (covers the gap between cancellation and actual period expiry)
  RETURN EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE (s.profile_id = v_user_id OR s.user_id = v_user_id)
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > now()
      AND s.status IN ('active', 'trialing', 'canceled', 'cancelled')
  );
END;
$$;
