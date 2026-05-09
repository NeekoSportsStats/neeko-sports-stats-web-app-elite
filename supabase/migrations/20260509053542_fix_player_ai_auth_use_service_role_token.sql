/*
  # Fix player AI auth — store service role key as cron secret

  The generate-player-ai edge function validates the bearer token by comparing it
  against values in internal.cron_secrets. The cron sends 'cron_auth_token' but
  the edge function's JS client cannot query the internal schema reliably, causing
  every call to return 401.

  Fix: create a public RPC that the edge function can call to validate its token,
  using SECURITY DEFINER to safely check internal.cron_secrets.
*/

-- Create a safe token validation RPC the edge function can call
CREATE OR REPLACE FUNCTION public.validate_cron_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM internal.cron_secrets
    WHERE value = p_token
      AND key IN ('cron_auth_token', 'supabase_secret_key')
  );
END;
$$;

-- Only service role can call this (no anon/authenticated access)
REVOKE ALL ON FUNCTION public.validate_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_cron_token(text) TO service_role;
