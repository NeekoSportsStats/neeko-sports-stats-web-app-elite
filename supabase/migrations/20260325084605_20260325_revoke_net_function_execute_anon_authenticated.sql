/*
  # Revoke net schema function-level EXECUTE from anon and authenticated

  ## Summary
  The schema-level REVOKE ALL ON SCHEMA net does not persist — Supabase platform
  re-grants USAGE automatically. This migration targets the function-level grants
  directly, which the platform does not reset.

  ## Changes
  - REVOKE EXECUTE on net.http_get and net.http_post from anon and authenticated
  - service_role and postgres retain full access

  ## Security Impact
  Prevents anon/authenticated roles from making outbound HTTP requests via pg_net
  directly from SQL context.
*/

DO $$
BEGIN
  -- Revoke http_get variants
  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_get(url text) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_get(url text, params jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  -- Revoke http_post variants
  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(url text, body jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;

  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
    NULL;
  END;
END $$;
