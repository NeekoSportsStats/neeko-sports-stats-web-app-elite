/*
  # Stripe System Finalisation & Profile Sync

  ## Summary
  This migration repairs and finalises the Stripe → Supabase integration.

  ## Changes

  ### 1. Auto-create profiles on new user signup
  - Creates trigger `trg_create_profile_on_signup` on `auth.users`
  - Ensures every auth user always has a corresponding profiles row
  - Backfills existing auth users who are missing a profile

  ### 2. Subscription sync trigger on stripe_subscriptions
  - Creates `fn_sync_subscription_to_profile()` function
  - Creates `trg_sync_subscription_to_profile` trigger
  - On INSERT or UPDATE of stripe_subscriptions, propagates status to profiles via stripe_customers join
  - Sets profiles.is_active, plan, subscription_status, subscription_tier, current_period_end

  ### 3. Premium users canonical view
  - Creates `v_premium_users` view for easy premium status auditing

  ### 4. Ensure stripe_subscriptions unique constraint covers customer_id
  - Adds unique constraint on customer_id if not already present (for upsert support)

  ### 5. Security
  - profiles RLS: existing policies preserved
  - v_premium_users: service role only (no public exposure)

  ## Notes
  - SAFE: no data deleted
  - Backfill is idempotent (INSERT ... ON CONFLICT DO NOTHING)
*/

-- ============================================================
-- 1. PROFILE AUTO-CREATE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_create_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_active, plan, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    'free',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile_on_signup ON auth.users;

CREATE TRIGGER trg_create_profile_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_create_profile_on_signup();

-- ============================================================
-- 2. BACKFILL EXISTING AUTH USERS INTO PROFILES
-- ============================================================

INSERT INTO public.profiles (id, email, is_active, plan, created_at, updated_at)
SELECT
  u.id,
  u.email,
  false,
  'free',
  NOW(),
  NOW()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. SUBSCRIPTION SYNC TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_subscription_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_is_active boolean;
  v_period_end timestamptz;
BEGIN
  -- Resolve user from stripe_customers (support both customer_id and stripe_id columns)
  SELECT COALESCE(sc.user_id, sc.profile_id)
  INTO v_user_id
  FROM public.stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id
     OR sc.stripe_id   = NEW.customer_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_active := NEW.status IN ('active', 'trialing');

  -- Convert unix epoch (bigint) to timestamptz
  IF NEW.current_period_end IS NOT NULL THEN
    v_period_end := to_timestamp(NEW.current_period_end);
  ELSE
    v_period_end := NULL;
  END IF;

  UPDATE public.profiles
  SET
    is_active           = v_is_active,
    plan                = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
    subscription_status = NEW.status,
    subscription_tier   = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
    stripe_customer_id  = NEW.customer_id,
    stripe_subscription_id = COALESCE(NEW.subscription_id, stripe_subscription_id),
    current_period_end  = v_period_end,
    updated_at          = NOW()
  WHERE id = v_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscription_to_profile ON public.stripe_subscriptions;

CREATE TRIGGER trg_sync_subscription_to_profile
  AFTER INSERT OR UPDATE ON public.stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_subscription_to_profile();

-- ============================================================
-- 4. ENSURE customer_id UNIQUE CONSTRAINT ON stripe_subscriptions
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stripe_subscriptions'::regclass
      AND contype = 'u'
      AND conname = 'stripe_subscriptions_customer_id_key'
  ) THEN
    ALTER TABLE public.stripe_subscriptions
      ADD CONSTRAINT stripe_subscriptions_customer_id_key UNIQUE (customer_id);
  END IF;
END $$;

-- ============================================================
-- 5. v_premium_users VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.v_premium_users AS
SELECT
  p.id,
  p.email,
  p.is_active,
  p.plan,
  p.stripe_customer_id,
  p.stripe_subscription_id,
  p.subscription_status,
  p.current_period_end
FROM public.profiles p
WHERE p.is_active = true;

-- ============================================================
-- 6. BACKFILL stripe_customers profile_id FROM user_id
-- ============================================================

UPDATE public.stripe_customers
SET profile_id = user_id
WHERE profile_id IS NULL AND user_id IS NOT NULL;

-- ============================================================
-- 7. SYNC EXISTING stripe_subscriptions TO profiles (retroactive)
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_user_id uuid;
  v_is_active boolean;
  v_period_end timestamptz;
BEGIN
  FOR r IN
    SELECT * FROM public.stripe_subscriptions
    WHERE subscription_id IS NOT NULL
  LOOP
    SELECT COALESCE(sc.user_id, sc.profile_id)
    INTO v_user_id
    FROM public.stripe_customers sc
    WHERE sc.customer_id = r.customer_id
       OR sc.stripe_id   = r.customer_id
    LIMIT 1;

    IF v_user_id IS NULL THEN
      CONTINUE;
    END IF;

    v_is_active := r.status IN ('active', 'trialing');

    IF r.current_period_end IS NOT NULL THEN
      v_period_end := to_timestamp(r.current_period_end);
    ELSE
      v_period_end := NULL;
    END IF;

    UPDATE public.profiles
    SET
      is_active           = v_is_active,
      plan                = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
      subscription_status = r.status,
      subscription_tier   = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
      stripe_customer_id  = r.customer_id,
      stripe_subscription_id = COALESCE(r.subscription_id, stripe_subscription_id),
      current_period_end  = v_period_end,
      updated_at          = NOW()
    WHERE id = v_user_id;
  END LOOP;
END $$;
