/*
  # Secure cron credential helper

  ## Summary
  Creates a security-definer function `public.get_cron_service_key()` that
  returns the Supabase service role JWT for use in pg_cron HTTP calls.

  The key is stored in a `cron_config` table that is:
  - Only accessible by the `postgres` role (owner)
  - Protected by RLS (no policies = locked down by default)
  - Used exclusively by `SECURITY DEFINER` functions running as `postgres`

  ## Why
  The vault is empty and `current_setting('app.service_role_key')` was never
  populated, so all existing HTTP cron jobs were silently failing auth.

  ## Tables
  - `internal.cron_config` — key/value store for cron credentials (postgres-only)

  ## Functions
  - `public.get_cron_service_key()` — SECURITY DEFINER, returns service_role JWT
*/

CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.cron_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE internal.cron_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON internal.cron_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON internal.cron_config TO postgres;

CREATE OR REPLACE FUNCTION public.get_cron_service_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal, public
AS $$
  SELECT value FROM internal.cron_config WHERE key = 'service_role_key';
$$;

REVOKE ALL ON FUNCTION public.get_cron_service_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_service_key() TO postgres;
