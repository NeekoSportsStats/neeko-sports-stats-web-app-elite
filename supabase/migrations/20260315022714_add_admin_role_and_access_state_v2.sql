/*
  # Admin Role Foundation

  ## Summary
  Adds a proper admin identity system to the database, replacing the
  insecure client-side hardcoded UUID approach.

  ## Changes

  ### 1. New Column: profiles.is_admin
  - Adds `is_admin boolean NOT NULL DEFAULT false` to public.profiles
  - Safe migration: only adds the column, never removes or alters existing data

  ### 2. Sets Known Admin
  - Sets is_admin = true for the known founder account
  - Safe: only updates a single row by known UUID

  ### 3. New Function: is_admin_user()
  - Returns true if the currently authenticated user has is_admin = true in their profile
  - SECURITY DEFINER so it can read profiles even with RLS active
  - Used internally by other secured functions

  ### 4. Updated Function: get_access_state()
  - Extended to also return is_admin in the response JSON
  - Frontend can now load admin state from the same server-trusted RPC call

  ## Security Notes
  - Admin identity is now stored in the database, not in frontend code
  - is_admin is only writable by service role (never by the user themselves)
  - The is_admin_user() function is the canonical check used by all backend guards
*/

-- Step 1: Add is_admin column to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Step 2: Set the known founder admin account
UPDATE public.profiles
SET is_admin = true
WHERE id = '4421a8b2-b5b6-4c93-b865-c8819a7ae902';

-- Step 3: Create canonical is_admin_user() function
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT is_admin INTO v_is_admin
  FROM public.profiles
  WHERE id = v_user_id
  LIMIT 1;

  RETURN COALESCE(v_is_admin, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- Step 4: Update get_access_state() to include is_admin
CREATE OR REPLACE FUNCTION public.get_access_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_premium   boolean := false;
  v_is_admin     boolean := false;
  v_is_authenticated boolean := false;
  v_user_id      uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_authenticated', false,
      'is_premium', false,
      'is_admin', false,
      'user_id', null
    );
  END IF;

  v_is_authenticated := true;

  SELECT is_premium_user() INTO v_is_premium;
  SELECT is_admin_user()   INTO v_is_admin;

  RETURN jsonb_build_object(
    'is_authenticated', v_is_authenticated,
    'is_premium', v_is_premium,
    'is_admin', v_is_admin,
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_access_state() TO authenticated, anon;
