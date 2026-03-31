/*
  # Fix admin_grant_manual_premium — Remove subscription_status coupling

  ## Problem
  The old grant RPC set subscription_status = 'active' as part of granting manual premium.
  This was dangerous because:
  - get_access_state() condition 1 previously checked subscription_status = 'active' with NO expiry
  - If is_manual_premium was later revoked but subscription_status = 'active' was left behind,
    the user would retain permanent premium access via condition 1
  - Now that condition 1 requires billing_period_end > now(), this risk is reduced, but
    setting subscription_status = 'active' from a manual grant is still semantically wrong
    and could corrupt Stripe sync if the webhook later reads it

  ## Fix
  - admin_grant_manual_premium: only writes is_manual_premium + manual_premium_expires_at
    Does NOT touch subscription_status at all
  - admin_revoke_manual_premium: unchanged (already correct — only clears manual fields)
  - Manual premium is now governed exclusively by conditions 2 (is_manual_premium + expiry)
    in get_access_state() and v_user_access

  ## Security
  - Admin guard unchanged: checks profiles.is_admin = true for caller
  - SECURITY DEFINER with explicit search_path
*/

CREATE OR REPLACE FUNCTION public.admin_grant_manual_premium(
  p_email text,
  p_days  integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_is_admin    boolean;
  v_target_id   uuid;
  v_expiry      timestamptz;
BEGIN
  v_caller_id := auth.uid();

  -- Verify caller is admin
  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Resolve user via auth.users — never via profiles.email
  SELECT id INTO v_target_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'User not found for email: %', p_email;
  END IF;

  v_expiry := now() + (p_days || ' days')::interval;

  -- Only write manual premium fields — do NOT touch subscription_status
  -- Manual access is governed solely by is_manual_premium + manual_premium_expires_at
  UPDATE public.profiles
  SET
    is_manual_premium         = true,
    manual_premium_expires_at = v_expiry,
    updated_at                = now()
  WHERE id = v_target_id;

  -- If no row existed yet (edge case: profile not created), upsert safely
  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      id,
      email,
      is_manual_premium,
      manual_premium_expires_at,
      created_at,
      updated_at
    )
    VALUES (
      v_target_id,
      p_email,
      true,
      v_expiry,
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      is_manual_premium         = true,
      manual_premium_expires_at = v_expiry,
      updated_at                = now();
  END IF;

  RAISE NOTICE 'Manual premium granted: email=%, user_id=%, expires=%', p_email, v_target_id, v_expiry;

  RETURN jsonb_build_object(
    'success',    true,
    'email',      p_email,
    'user_id',    v_target_id,
    'expires_at', v_expiry
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_revoke_manual_premium(
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id  uuid;
  v_is_admin   boolean;
  v_target_id  uuid;
BEGIN
  v_caller_id := auth.uid();

  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Resolve via auth.users — not profiles.email
  SELECT id INTO v_target_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'User not found for email: %', p_email;
  END IF;

  UPDATE public.profiles
  SET
    is_manual_premium         = false,
    manual_premium_expires_at = null,
    updated_at                = now()
  WHERE id = v_target_id;

  RAISE NOTICE 'Manual premium revoked: email=%, user_id=%', p_email, v_target_id;

  RETURN jsonb_build_object('success', true, 'email', p_email, 'user_id', v_target_id);
END;
$$;
