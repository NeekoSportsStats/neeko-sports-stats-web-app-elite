/*
  # Create internal cron secrets store

  ## Summary
  Creates a secure schema and table for storing cron authentication secrets,
  plus a SECURITY DEFINER helper function for pg_cron jobs to retrieve them.

  ## New Schema
  - `internal` — private schema, not exposed via PostgREST

  ## New Tables
  - `internal.cron_secrets` — key/value store for cron credentials
    - `key` (text, primary key)
    - `value` (text, the secret value)
    - `created_at` (timestamptz, default now())

  ## New Functions
  - `internal.get_cron_secret(p_key text)` — SECURITY DEFINER, postgres-only,
    returns the secret value for the given key

  ## Security
  - All privileges on `internal.cron_secrets` revoked from PUBLIC, anon, authenticated
  - Only `postgres` role can read/write the table directly
  - Helper function executable only by `postgres`
  - RLS enabled on secrets table (locked down, no policies = no access)

  ## Notes
  - Operator must INSERT the Supabase Secret Key after deployment:
      INSERT INTO internal.cron_secrets (key, value)
      VALUES ('supabase_secret_key', '<SB_SECRET_KEY>')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  - The secret key is found at: Supabase Dashboard > Project Settings > API > Secret Keys
*/

CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.cron_secrets (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE internal.cron_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON internal.cron_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON internal.cron_secrets TO postgres;

CREATE OR REPLACE FUNCTION internal.get_cron_secret(p_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal
AS $$
  SELECT value FROM internal.cron_secrets WHERE key = p_key;
$$;

REVOKE ALL ON FUNCTION internal.get_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.get_cron_secret(text) TO postgres;
