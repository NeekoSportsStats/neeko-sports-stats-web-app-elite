/*
  # Subscription Health Monitoring System

  ## Summary
  Additive-only monitoring layer. Detects broken subscription states and surfaces
  them for admin review. Does NOT affect access logic, Stripe flow, or auth.

  ## New Objects

  ### Views
  - `public.v_subscription_health` — one row per detected issue, UNIONed by issue type
  - `public.v_subscription_health_summary` — single-row count summary

  ### Functions
  - `public.check_subscription_health()` — returns JSON with issue list (top 50)

  ## Issue Types Detected
  1. MISSING_BILLING_PERIOD — active/trialing/canceled with NULL billing_period_end
  2. EXPIRED_BUT_STILL_ACTIVE_FLAG — active/trialing with billing_period_end in the past
  3. PREMIUM_EXPIRES_MISMATCH — premium_expires_at != billing_period_end (when both set)
  4. MANUAL_PREMIUM_EXPIRED — is_manual_premium=true but manual_premium_expires_at < now()
  5. STRIPE_ID_MISSING — active/trialing subscription but no stripe_customer_id
  6. STALE_SUBSCRIPTION — active/trialing but profiles.updated_at > 7 days old

  ## Security
  - Views: authenticated + service_role read
  - Function: security definer, authenticated + service_role execute
  - No write access granted
  - No impact on existing RLS policies
*/

-- ============================================================
-- 1. v_subscription_health — one row per issue
-- ============================================================
DROP VIEW IF EXISTS public.v_subscription_health CASCADE;

CREATE VIEW public.v_subscription_health AS

-- Issue 1: Active/trialing/canceled status but billing_period_end is NULL
SELECT
  p.id                       AS user_id,
  p.email,
  'MISSING_BILLING_PERIOD'   AS issue_type,
  'Subscription is ' || p.subscription_status || ' but billing_period_end is NULL — access logic will deny premium' AS issue_description,
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.subscription_status IN ('active', 'trialing', 'canceled', 'cancelled')
  AND p.billing_period_end IS NULL
  AND COALESCE(p.is_manual_premium, false) = false

UNION ALL

-- Issue 2: Active/trialing but billing_period_end is in the past (data integrity failure)
SELECT
  p.id,
  p.email,
  'EXPIRED_BUT_STILL_ACTIVE_FLAG',
  'subscription_status=' || p.subscription_status || ' but billing_period_end=' || p.billing_period_end::text || ' is in the past — webhook may not have fired',
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.subscription_status IN ('active', 'trialing')
  AND p.billing_period_end IS NOT NULL
  AND p.billing_period_end < now()
  AND COALESCE(p.is_manual_premium, false) = false

UNION ALL

-- Issue 3: premium_expires_at and billing_period_end both set but do not match
SELECT
  p.id,
  p.email,
  'PREMIUM_EXPIRES_MISMATCH',
  'premium_expires_at (' || p.premium_expires_at::text || ') differs from billing_period_end (' || p.billing_period_end::text || ') — may cause access inconsistency',
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.premium_expires_at IS NOT NULL
  AND p.billing_period_end IS NOT NULL
  AND abs(extract(epoch from (p.premium_expires_at - p.billing_period_end))) > 60
  AND COALESCE(p.is_manual_premium, false) = false

UNION ALL

-- Issue 4: is_manual_premium=true but expiry has passed
SELECT
  p.id,
  p.email,
  'MANUAL_PREMIUM_EXPIRED',
  'is_manual_premium=true but manual_premium_expires_at=' || p.manual_premium_expires_at::text || ' has passed — user no longer has manual premium access',
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.is_manual_premium = true
  AND p.manual_premium_expires_at IS NOT NULL
  AND p.manual_premium_expires_at < now()

UNION ALL

-- Issue 5: active/trialing but no stripe_customer_id
SELECT
  p.id,
  p.email,
  'STRIPE_ID_MISSING',
  'subscription_status=' || p.subscription_status || ' but stripe_customer_id is NULL — Stripe webhook may not have run correctly',
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.subscription_status IN ('active', 'trialing')
  AND p.stripe_customer_id IS NULL
  AND COALESCE(p.is_manual_premium, false) = false

UNION ALL

-- Issue 6: active/trialing but profile not updated in 7+ days (webhook may be failing)
SELECT
  p.id,
  p.email,
  'STALE_SUBSCRIPTION',
  'subscription_status=' || p.subscription_status || ' but profile.updated_at=' || p.updated_at::text || ' — no Stripe sync in 7+ days',
  p.subscription_status,
  p.billing_period_end,
  p.premium_expires_at,
  p.is_manual_premium,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.subscription_status IN ('active', 'trialing')
  AND p.updated_at < now() - interval '7 days'
  AND COALESCE(p.is_manual_premium, false) = false;

GRANT SELECT ON public.v_subscription_health TO authenticated;
GRANT SELECT ON public.v_subscription_health TO service_role;

-- ============================================================
-- 2. v_subscription_health_summary — single-row count summary
-- ============================================================
DROP VIEW IF EXISTS public.v_subscription_health_summary CASCADE;

CREATE VIEW public.v_subscription_health_summary AS
SELECT
  count(*)                                                                                    AS total_issues,
  count(*) FILTER (WHERE issue_type = 'MISSING_BILLING_PERIOD')                              AS missing_billing_period_count,
  count(*) FILTER (WHERE issue_type = 'EXPIRED_BUT_STILL_ACTIVE_FLAG')                      AS expired_active_count,
  count(*) FILTER (WHERE issue_type = 'PREMIUM_EXPIRES_MISMATCH')                           AS mismatch_count,
  count(*) FILTER (WHERE issue_type = 'MANUAL_PREMIUM_EXPIRED')                             AS manual_expired_count,
  count(*) FILTER (WHERE issue_type = 'STRIPE_ID_MISSING')                                  AS stripe_missing_count,
  count(*) FILTER (WHERE issue_type = 'STALE_SUBSCRIPTION')                                 AS stale_count
FROM public.v_subscription_health;

GRANT SELECT ON public.v_subscription_health_summary TO authenticated;
GRANT SELECT ON public.v_subscription_health_summary TO service_role;

-- ============================================================
-- 3. check_subscription_health() RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_subscription_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_summary  jsonb;
  v_issues   jsonb;
BEGIN
  SELECT row_to_json(s)::jsonb INTO v_summary
  FROM public.v_subscription_health_summary s;

  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id',          h.user_id,
      'email',            h.email,
      'issue_type',       h.issue_type,
      'issue_description',h.issue_description,
      'subscription_status', h.subscription_status,
      'billing_period_end', h.billing_period_end,
      'updated_at',       h.updated_at
    )
    ORDER BY h.issue_type, h.updated_at
  ) INTO v_issues
  FROM (
    SELECT * FROM public.v_subscription_health
    LIMIT 50
  ) h;

  RETURN jsonb_build_object(
    'total_issues', COALESCE((v_summary->>'total_issues')::int, 0),
    'summary',      COALESCE(v_summary, '{}'::jsonb),
    'issues',       COALESCE(v_issues, '[]'::jsonb)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'check_subscription_health() error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('total_issues', -1, 'error', SQLERRM, 'issues', '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_subscription_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_subscription_health() TO service_role;
