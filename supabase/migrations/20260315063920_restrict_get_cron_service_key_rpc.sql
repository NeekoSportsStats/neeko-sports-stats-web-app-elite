/*
  # Restrict get_cron_service_key() RPC

  ## Problem
  The `get_cron_service_key()` function is a SECURITY DEFINER function that returns the
  service-role key from the `afl.cron_secrets` table. Because it runs with elevated owner
  permissions it was callable by any authenticated session, effectively exposing the master
  credential to any logged-in user.

  ## Changes
  1. Replace the existing `get_cron_service_key()` function with a hardened version that
     checks `is_admin_user()` before returning the value.
  2. Any non-admin caller receives a permission-denied exception instead of the key.

  ## Security
  - Only users whose `profiles.is_admin = true` can invoke this function successfully.
  - Anon and regular authenticated users receive SQLSTATE 42501 (insufficient privilege).
*/

CREATE OR REPLACE FUNCTION public.get_cron_service_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT (SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_key
  FROM afl.cron_secrets
  WHERE key = 'service_role_key'
  LIMIT 1;

  RETURN v_key;
END;
$$;
