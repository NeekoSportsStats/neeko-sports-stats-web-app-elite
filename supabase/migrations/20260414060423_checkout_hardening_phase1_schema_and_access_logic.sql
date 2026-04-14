/*
  # Checkout Hardening — Phase 1: Schema + Access Logic

  ## What this does

  1. Adds `plan_type` column to `subscriptions` table
     - Tracks whether the row is 'season' (one-time) or 'weekly' (recurring)
     - Used by Account page and access checks to show correct plan label

  2. Adds `interval` column to `stripe_products_config` if missing nothing; ensures
     placeholder detection works by adding a `validated` boolean flag

  3. Rebuilds `is_premium_user()` to:
     - Correctly grant access to season-pass holders (status = 'active', current_period_end > now())
     - Correctly grant access to canceled-but-within-period weekly subscribers
     - Still check manual_premium override

  4. Rebuilds `get_access_state()` to expose `plan_type` in its JSON return

  ## Tables modified
  - `subscriptions`: adds `plan_type text`
  - `stripe_products_config`: adds `validated boolean DEFAULT false`

  ## Functions rebuilt
  - `is_premium_user()` — correct canceled-still-valid logic
  - `get_access_state()` — exposes plan_type
*/

-- 1. Add plan_type to subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN plan_type text;
  END IF;
END $$;

-- 2. Add validated flag to stripe_products_config (marks when real IDs have been set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_products_config' AND column_name = 'validated'
  ) THEN
    ALTER TABLE public.stripe_products_config ADD COLUMN validated boolean DEFAULT false;
  END IF;
END $$;

-- 3. Rebuild is_premium_user() with correct canceled-but-valid logic
CREATE OR REPLACE FUNCTION public.is_premium_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  -- Grant access if:
  --   A) status is active/trialing AND period not expired (covers both season + weekly active)
  --   B) status is canceled/cancelled BUT current_period_end is still in the future
  --      (canceled weekly users retain access until billing period ends)
  RETURN EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE (s.profile_id = v_user_id OR s.user_id = v_user_id)
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end > now()
    AND (
      s.status IN ('active', 'trialing')
      OR (
        s.status IN ('canceled', 'cancelled')
        AND COALESCE(s.cancel_at_period_end, false) = true
      )
    )
  );
END;
$$;

-- 4. Rebuild get_access_state() to expose plan_type
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
  IF v_manual_premium THEN
    v_billing_state := 'active';
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
    AND v_cancel_at_period_end = true
  THEN
    v_billing_state := 'cancelling';
  ELSIF v_subscription_status IN ('active', 'trialing')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
  THEN
    v_billing_state := 'active';
  ELSIF v_subscription_status IN ('canceled', 'cancelled')
    AND v_period_end IS NOT NULL
    AND v_period_end > now()
  THEN
    -- Canceled but still within paid period
    v_billing_state := 'cancelling';
  ELSIF v_subscription_status IN ('canceled', 'incomplete_expired', 'unpaid')
    OR (v_period_end IS NOT NULL AND v_period_end <= now())
  THEN
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
    'billing_state',       v_billing_state,
    'plan_type',           v_plan_type
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
