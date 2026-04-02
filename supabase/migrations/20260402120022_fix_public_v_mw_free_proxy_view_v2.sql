/*
  # Fix public.v_mw_free — expose market schema view to PostgREST

  ## Problem
  Frontend queries `public.v_mw_free` but the view only exists in the `market` schema.
  PostgREST only serves the `public` schema by default, causing 404 errors.

  ## Changes
  - Drop and recreate `public.v_mw_free` as a SECURITY DEFINER view wrapping `market.v_mw_free`
  - Grant SELECT to anon and authenticated roles

  ## Notes
  - Uses SECURITY DEFINER so anon users can read without needing direct access to market schema
*/

DROP VIEW IF EXISTS public.v_mw_free CASCADE;

CREATE VIEW public.v_mw_free
WITH (security_invoker = false)
AS
SELECT *
FROM market.v_mw_free;

GRANT SELECT ON public.v_mw_free TO anon, authenticated;
