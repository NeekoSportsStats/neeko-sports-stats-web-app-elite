/*
  # Fix Manual Premium System: Use user_id (not profiles.email)

  ## Root Cause
  The previous manual premium system wrote directly to profiles using:
    WHERE email = 'bailey.dalton0718@gmail.com'
  
  But profiles.email is often NULL in this system because:
  - Supabase stores email canonically in auth.users, not in profiles
  - The profile creation trigger did not reliably copy email across
  
  Result: silent 0-row UPDATEs. Bailey never received premium.

  ## Fixes Applied

  ### 1. Immediate fix — grant Bailey premium via auth.users lookup (user_id path)
  Uses ON CONFLICT (id) DO UPDATE — cannot silently fail if user exists in auth.users.

  ### 2. Rebuild admin_grant_manual_premium
  - Looks up user_id from auth.users by email
  - Updates profiles WHERE id = v_target_id (never NULL-email-dependent)
  - RAISES EXCEPTION if user not found (no silent failures)
  - Logs NOTICE with user_id for tracing

  ### 3. Rebuild admin_revoke_manual_premium
  - Same fix: lookup via auth.users, update by id

  ### 4. Backfill profiles.email from auth.users
  - Copies email into all profiles rows where email IS NULL
  - Makes future email-based queries reliable as a secondary path

  ### 5. Harden profile creation trigger
  - Ensures new profiles always receive email from auth.users at creation time

  ## Security
  - admin_grant_manual_premium and admin_revoke_manual_premium remain admin-only
  - Both are SECURITY DEFINER with search_path locked
*/

-- ─── 1. Immediate fix: grant Bailey premium via user_id path ─────────────────

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'bailey.dalton0718@gmail.com' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'bailey.dalton0718@gmail.com not found in auth.users — no action taken';
  ELSE
    INSERT INTO public.profiles (
      id,
      email,
      is_manual_premium,
      manual_premium_expires_at,
      subscription_status,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      'bailey.dalton0718@gmail.com',
      true,
      now() + INTERVAL '2 years',
      'active',
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      is_manual_premium = true,
      manual_premium_expires_at = now() + INTERVAL '2 years',
      subscription_status = 'active',
      updated_at = now();

    RAISE NOTICE 'Manual premium granted to bailey.dalton0718@gmail.com (user_id: %)', v_user_id;
  END IF;
END $$;

-- ─── 2. Rebuild admin_grant_manual_premium — user_id path, no silent failures ─

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

  -- Resolve user via auth.users — NEVER via profiles.email
  SELECT id INTO v_target_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'User not found for email: %', p_email;
  END IF;

  v_expiry := now() + (p_days || ' days')::interval;

  -- Upsert by user_id — guaranteed to hit if user exists
  INSERT INTO public.profiles (
    id,
    email,
    is_manual_premium,
    manual_premium_expires_at,
    subscription_status,
    created_at,
    updated_at
  )
  VALUES (
    v_target_id,
    p_email,
    true,
    v_expiry,
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_manual_premium            = true,
    manual_premium_expires_at    = v_expiry,
    subscription_status          = 'active',
    updated_at                   = now();

  RAISE NOTICE 'Manual premium granted: email=%, user_id=%, expires=%', p_email, v_target_id, v_expiry;

  RETURN jsonb_build_object(
    'success',     true,
    'email',       p_email,
    'user_id',     v_target_id,
    'expires_at',  v_expiry
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_manual_premium(text, integer) TO authenticated;

-- ─── 3. Rebuild admin_revoke_manual_premium — user_id path ───────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_manual_premium(p_email text)
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

GRANT EXECUTE ON FUNCTION public.admin_revoke_manual_premium(text) TO authenticated;

-- ─── 4. Backfill profiles.email from auth.users where NULL ───────────────────

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- ─── 5. Harden profile creation trigger ──────────────────────────────────────
-- Ensure new profile rows always receive email copied from auth.users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    updated_at = now()
  WHERE profiles.email IS NULL;

  RETURN NEW;
END;
$$;

-- Re-wire the trigger (drop + recreate is safe — idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
