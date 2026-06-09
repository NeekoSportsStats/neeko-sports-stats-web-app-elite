
-- Narrow self-only profile summary: no Stripe IDs, no is_admin, no internal fields
CREATE OR REPLACE FUNCTION public.get_my_profile_summary()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  subscription_status text,
  cancel_at_period_end boolean,
  premium_expires_at timestamptz,
  current_period_end timestamptz,
  billing_period_end timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    id,
    email,
    created_at,
    subscription_status,
    cancel_at_period_end,
    premium_expires_at,
    current_period_end,
    billing_period_end
  FROM public.profiles
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_summary() TO authenticated;

-- Narrow self-only subscription summary: no Stripe IDs
CREATE OR REPLACE FUNCTION public.get_my_subscription_summary()
RETURNS TABLE (
  id uuid,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  plan_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    id,
    status,
    current_period_end,
    cancel_at_period_end,
    plan_type
  FROM public.subscriptions
  WHERE user_id = auth.uid() OR profile_id = auth.uid()
  ORDER BY updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_subscription_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_summary() TO authenticated;
