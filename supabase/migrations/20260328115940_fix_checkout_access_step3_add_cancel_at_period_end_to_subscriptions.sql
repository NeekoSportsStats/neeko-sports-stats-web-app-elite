/*
  # Fix Step 3: Add cancel_at_period_end to subscriptions table

  ## Problem
  get_access_state() needs cancel_at_period_end to determine billing_state (active vs cancelling).
  The subscriptions table (source of truth) did not have this column, so:
  - The trigger upsert couldn't carry the value across
  - get_access_state() had to fall back to stripe_subscriptions join (fragile)

  ## Changes
  - Adds cancel_at_period_end boolean NOT NULL DEFAULT false to public.subscriptions
  - Updates fn_sync_subscription_to_profile to write cancel_at_period_end to subscriptions
  - Rebuilds get_access_state() to read cancel_at_period_end from subscriptions correctly
    (removes the comment noting the column didn't exist)

  ## No data loss — existing rows get DEFAULT false which is correct for fully-active subs
*/

-- Add column to subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'cancel_at_period_end'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Rebuild trigger function to also write cancel_at_period_end to subscriptions
CREATE OR REPLACE FUNCTION public.fn_sync_subscription_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id      uuid;
  v_is_active    boolean;
  v_period_end   timestamptz;
  v_period_start timestamptz;
BEGIN
  -- Resolve user from stripe_customers
  SELECT COALESCE(sc.user_id, sc.profile_id)
  INTO v_user_id
  FROM public.stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id
     OR sc.stripe_id   = NEW.customer_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_active := NEW.status IN ('active', 'trialing');

  IF NEW.current_period_end IS NOT NULL THEN
    v_period_end := to_timestamp(NEW.current_period_end);
  END IF;

  IF NEW.current_period_start IS NOT NULL THEN
    v_period_start := to_timestamp(NEW.current_period_start);
  END IF;

  -- 1. Update profiles mirror (cancel_at_period_end, status, dates)
  UPDATE public.profiles
  SET
    is_active              = v_is_active,
    plan                   = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
    subscription_status    = NEW.status,
    subscription_tier      = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
    stripe_customer_id     = NEW.customer_id,
    stripe_subscription_id = COALESCE(NEW.subscription_id, stripe_subscription_id),
    current_period_end     = COALESCE(v_period_end, current_period_end),
    cancel_at_period_end   = COALESCE(NEW.cancel_at_period_end, false),
    updated_at             = now()
  WHERE id = v_user_id;

  -- 2. Upsert into subscriptions (source of truth for is_premium_user + get_access_state)
  IF NEW.subscription_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      profile_id,
      user_id,
      stripe_subscription_id,
      stripe_customer_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      updated_at
    )
    VALUES (
      v_user_id,
      v_user_id,
      NEW.subscription_id,
      NEW.customer_id,
      NEW.status,
      v_period_start,
      v_period_end,
      COALESCE(NEW.cancel_at_period_end, false),
      now()
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status               = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end   = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      user_id              = EXCLUDED.user_id,
      profile_id           = EXCLUDED.profile_id,
      stripe_customer_id   = EXCLUDED.stripe_customer_id,
      updated_at           = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Now rebuild get_access_state() cleanly — reads cancel_at_period_end from subscriptions
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
      'is_authenticated', false,
      'is_premium',       false,
      'is_admin',         false,
      'user_id',          null,
      'billing_state',    'free'
    );
  END IF;

  v_is_premium := is_premium_user();
  v_is_admin   := is_admin_user();

  -- Manual premium flag (admin-granted, independent of Stripe)
  SELECT COALESCE(p.is_manual_premium, false)
  INTO v_manual_premium
  FROM public.profiles p
  WHERE p.id = v_user_id
  LIMIT 1;

  -- Primary: read from subscriptions (source of truth)
  SELECT
    s.status,
    s.current_period_end,
    COALESCE(s.cancel_at_period_end, false)
  INTO v_subscription_status, v_period_end, v_cancel_at_period_end
  FROM public.subscriptions s
  WHERE (s.profile_id = v_user_id OR s.user_id = v_user_id)
  ORDER BY s.updated_at DESC
  LIMIT 1;

  -- Fallback: profiles mirror (covers manual premium + pre-migration users)
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
  IF v_manual_premium THEN
    -- Admin-granted access always reads as active regardless of Stripe
    v_billing_state := 'active';
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
    AND v_cancel_at_period_end = true
  THEN
    -- Paid, still has time left, but will not renew
    v_billing_state := 'cancelling';
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
  THEN
    -- Fully active
    v_billing_state := 'active';
  ELSIF v_subscription_status IN ('canceled', 'incomplete_expired', 'unpaid')
    OR (v_period_end IS NOT NULL AND v_period_end <= now())
  THEN
    -- Access has lapsed
    v_billing_state := 'expired';
  ELSE
    v_billing_state := 'free';
  END IF;

  RETURN jsonb_build_object(
    'is_authenticated',    true,
    'is_premium',          v_is_premium,
    'is_admin',            v_is_admin,
    'user_id',             v_user_id,
    'subscription_status', v_subscription_status,
    'cancel_at_period_end', COALESCE(v_cancel_at_period_end, false),
    'period_end',          v_period_end,
    'manual_premium',      v_manual_premium,
    'billing_state',       v_billing_state
  );
END;
$$;
