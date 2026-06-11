
-- 1. Revoke all write access from anon and authenticated on stripe_products_config
-- Only service_role (used by edge functions) should be able to write this table.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.stripe_products_config FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.stripe_products_config FROM authenticated;

-- Keep SELECT for authenticated (checkout UI may display plan info) but anon gets nothing
REVOKE SELECT ON TABLE public.stripe_products_config FROM anon;

-- Drop any existing permissive write policies
DROP POLICY IF EXISTS "allow_all_stripe_products_config" ON public.stripe_products_config;
DROP POLICY IF EXISTS "anon_read_stripe_products_config" ON public.stripe_products_config;
DROP POLICY IF EXISTS "authenticated_read_stripe_products_config" ON public.stripe_products_config;

-- Read-only policy for authenticated users (checkout needs to read plan labels)
CREATE POLICY "authenticated_select_stripe_products_config"
  ON public.stripe_products_config FOR SELECT
  TO authenticated
  USING (true);

-- Service role bypasses RLS; no write policy needed for anon/authenticated.

-- 2. Fix the amount for round_pass_7d (was stored as 999, should be 799)
UPDATE public.stripe_products_config
SET amount = 799, validated = true
WHERE plan_key = 'round_pass_7d';
