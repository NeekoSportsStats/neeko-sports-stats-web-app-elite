/*
  # Fix: Create public.v_mw_premium proxy view

  ## Problem
  The frontend references `public.v_mw_premium` but the view only exists in
  the `market` schema as `market.v_mw_premium`. Every premium Market Watch
  query was returning a 42P01 relation-not-found error, rendering the page blank
  for all premium users.

  ## Fix
  Create a thin proxy view in the `public` schema that delegates to
  `market.v_mw_premium`. No logic is duplicated — this is purely a schema
  accessibility fix.

  ## Security
  Grant SELECT to authenticated and anon roles so PostgREST can serve it
  through the existing RLS chain on the underlying market view.
*/

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

GRANT SELECT ON public.v_mw_premium TO authenticated, anon;
