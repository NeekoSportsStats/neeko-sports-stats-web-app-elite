/*
  # Fix public.v_mw_free proxy view

  ## Problem
  - public.v_mw_free returns 0 rows due to filtering for non-existent action values (TARGET, WATCH, AVOID)
  - market.v_mw_free returns 100 rows correctly
  - Frontend queries public schema by default

  ## Solution
  - Rebuild public.v_mw_free as direct proxy to market.v_mw_free
  - Rebuild public.v_mw_premium as direct proxy to market.v_mw_premium
  - Ensures frontend gets data regardless of schema queried

  ## Changes
  1. Drop and recreate public.v_mw_free → simple SELECT * FROM market.v_mw_free
  2. Drop and recreate public.v_mw_premium → simple SELECT * FROM market.v_mw_premium
  3. Grant SELECT to anon, authenticated
*/

-- Drop existing broken views
DROP VIEW IF EXISTS public.v_mw_free CASCADE;
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;

-- Create public.v_mw_free as direct proxy to market schema
CREATE OR REPLACE VIEW public.v_mw_free AS
SELECT * FROM market.v_mw_free;

-- Create public.v_mw_premium as direct proxy to market schema
CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

-- Grant permissions
GRANT SELECT ON public.v_mw_free TO anon, authenticated;
GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

-- Add helpful comment
COMMENT ON VIEW public.v_mw_free IS 'Proxy view to market.v_mw_free - top 100 market watch players for free tier';
COMMENT ON VIEW public.v_mw_premium IS 'Proxy view to market.v_mw_premium - all market watch players for premium tier';