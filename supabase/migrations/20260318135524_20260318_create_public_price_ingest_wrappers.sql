/*
  # Create public wrapper RPCs for price ingest functions

  ## Problem
  The Supabase JS client's .schema("afl").rpc() does not correctly route
  to non-public schema functions via PostgREST. Calling afl.preview_price_ingest
  via the REST API returns a 404/error because PostgREST only exposes the
  public schema by default.

  ## Solution
  Create thin public-schema wrapper functions that delegate to the afl-schema
  implementations. The edge function calls these public wrappers via admin.rpc().

  ## Functions created:
  1. public.preview_price_ingest_public(p_rows jsonb) → jsonb
     Delegates to afl.preview_price_ingest(p_rows)
  2. public.process_price_ingest_public(p_rows jsonb) → jsonb
     Delegates to afl.process_price_ingest(p_rows)
*/

CREATE OR REPLACE FUNCTION public.preview_price_ingest_public(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  RETURN afl.preview_price_ingest(p_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_price_ingest_public(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  RETURN afl.process_price_ingest(p_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_price_ingest_public(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_price_ingest_public(jsonb) TO service_role;
