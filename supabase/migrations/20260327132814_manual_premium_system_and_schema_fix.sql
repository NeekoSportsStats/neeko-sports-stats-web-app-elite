/*
  # Manual Premium System + Profiles Schema Fix

  ## Root Cause
  The webhook was writing columns (is_premium, is_active, subscription_tier, plan,
  current_period_end) that do not exist in the profiles table. This caused every
  webhook upsert to silently fail, so:
  - Stripe payments completed but profiles were never updated
  - Manual premium grants could be overwritten to 'inactive' by the next webhook fire

  The real profiles schema uses: subscription_status, premium_expires_at, billing_period_end.

  ## Changes

  ### 1. profiles table - add missing columns the webhook and frontend need
  - subscription_status (already exists, keeping)
  - premium_expires_at (already exists, keeping)
  - is_manual_premium (NEW) - permanent manual override flag
  - manual_premium_expires_at (NEW) - optional expiry for manual grants
  - is_admin (NEW) - admin flag

  ### 2. Immediate fix - grant bailey.dalton0718@gmail.com manual premium
  - Sets is_manual_premium = true
  - Sets manual_premium_expires_at = 2 years from now
  - Sets subscription_status = 'active'

  ### 3. Rebuild get_access_state() RPC
  - Checks subscription_status = 'active' OR is_manual_premium with valid expiry
  - Manual premium is immune to webhook overwrites

  ### 4. Admin helper function: grant_manual_premium(email, days)
  - Safe, admin-only way to grant manual premium
*/

-- ─── 1. Add missing columns to profiles ──────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_manual_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_premium_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ─── 2. Index for admin lookups ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ─── 3. Grant bailey.dalton0718@gmail.com manual premium immediately ─────────
-- Uses email column which exists in profiles (confirmed from schema above)

UPDATE public.profiles
SET
  is_manual_premium = true,
  manual_premium_expires_at = now() + INTERVAL '2 years',
  subscription_status = 'active',
  updated_at = now()
WHERE email = 'bailey.dalton0718@gmail.com';

-- If profile row exists in auth but not yet in profiles, insert it
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'bailey.dalton0718@gmail.com' LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, is_manual_premium, manual_premium_expires_at, subscription_status, created_at, updated_at)
    VALUES (v_user_id, 'bailey.dalton0718@gmail.com', true, now() + INTERVAL '2 years', 'active', now(), now())
    ON CONFLICT (id) DO UPDATE SET
      is_manual_premium = true,
      manual_premium_expires_at = now() + INTERVAL '2 years',
      subscription_status = 'active',
      updated_at = now();
  END IF;
END $$;

-- ─── 4. Rebuild get_access_state() RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_premium boolean := false;
  v_is_admin boolean := false;
  v_sub_status text := null;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_premium', false, 'is_admin', false, 'subscription_status', null);
  END IF;

  SELECT
    -- Premium if: active subscription OR valid manual override OR paid period still active
    (
      p.subscription_status IN ('active', 'trialing')
      OR (p.is_manual_premium = true AND (p.manual_premium_expires_at IS NULL OR p.manual_premium_expires_at > now()))
      OR (p.premium_expires_at IS NOT NULL AND p.premium_expires_at > now())
      OR (p.billing_period_end IS NOT NULL AND p.billing_period_end > now() AND p.subscription_status = 'active')
    ),
    p.subscription_status,
    COALESCE(p.is_admin, false)
  INTO v_is_premium, v_sub_status, v_is_admin
  FROM public.profiles p
  WHERE p.id = v_user_id;

  -- Fallback: check stripe_subscriptions directly if profile says no
  IF NOT COALESCE(v_is_premium, false) THEN
    SELECT ss.status INTO v_sub_status
    FROM public.stripe_customers sc
    JOIN public.stripe_subscriptions ss ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = v_user_id
      AND ss.status IN ('active', 'trialing')
    LIMIT 1;

    IF FOUND AND v_sub_status IS NOT NULL THEN
      v_is_premium := true;
      -- Self-heal: update profile so next call is fast
      UPDATE public.profiles
      SET subscription_status = v_sub_status, updated_at = now()
      WHERE id = v_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_premium', COALESCE(v_is_premium, false),
    'is_admin', COALESCE(v_is_admin, false),
    'subscription_status', v_sub_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_state() TO authenticated;

-- ─── 5. Admin helper: grant_manual_premium(email, days) ──────────────────────

CREATE OR REPLACE FUNCTION public.admin_grant_manual_premium(
  p_email text,
  p_days integer DEFAULT 730
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_target_id uuid;
  v_expiry timestamptz;
BEGIN
  v_caller_id := auth.uid();

  -- Verify caller is admin
  SELECT COALESCE(is_admin, false) INTO v_is_admin FROM public.profiles WHERE id = v_caller_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_expiry := now() + (p_days || ' days')::interval;

  -- Find user in auth
  SELECT id INTO v_target_id FROM auth.users WHERE email = p_email LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found: ' || p_email);
  END IF;

  INSERT INTO public.profiles (id, email, is_manual_premium, manual_premium_expires_at, subscription_status, created_at, updated_at)
  VALUES (v_target_id, p_email, true, v_expiry, 'active', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    is_manual_premium = true,
    manual_premium_expires_at = v_expiry,
    subscription_status = 'active',
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'email', p_email,
    'user_id', v_target_id,
    'expires_at', v_expiry
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_manual_premium(text, integer) TO authenticated;

-- ─── 6. Admin helper: revoke_manual_premium(email) ───────────────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_manual_premium(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
BEGIN
  v_caller_id := auth.uid();
  SELECT COALESCE(is_admin, false) INTO v_is_admin FROM public.profiles WHERE id = v_caller_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.profiles
  SET is_manual_premium = false, manual_premium_expires_at = null, updated_at = now()
  WHERE email = p_email;

  RETURN jsonb_build_object('success', true, 'email', p_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_manual_premium(text) TO authenticated;
