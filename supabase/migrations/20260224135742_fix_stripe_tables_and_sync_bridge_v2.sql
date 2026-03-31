/*
  # Fix Stripe tables and create sync bridge to profiles (v2)

  ## Problem
  The stripe_customers table uses profile_id (not user_id).
  The deployed stripe-checkout edge function inserts with user_id column — causing silent failures.
  The stripe_subscriptions table does not exist — webhook upserts fail.
  Nothing ever updates profiles.subscription_status after checkout.

  ## Changes
  1. Add user_id alias to stripe_customers (same as profile_id) so the edge function insert succeeds
  2. Add customer_id alias to stripe_customers (same as stripe_id)
  3. Create stripe_subscriptions table matching the webhook's upsert schema
  4. Trigger: stripe_subscriptions → sync profiles.subscription_status + subscriptions table
  5. Trigger: stripe_customers → sync profiles.stripe_customer_id
*/

-- 1. Add user_id column to stripe_customers (edge function writes this)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_customers' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.stripe_customers ADD COLUMN user_id uuid;
  END IF;
END $$;

-- 2. Add customer_id column to stripe_customers (edge function + webhook use this)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_customers' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.stripe_customers ADD COLUMN customer_id text UNIQUE;
  END IF;
END $$;

-- Backfill both alias columns from existing data
UPDATE public.stripe_customers
SET
  user_id     = profile_id,
  customer_id = stripe_id
WHERE (user_id IS NULL OR customer_id IS NULL)
  AND (profile_id IS NOT NULL OR stripe_id IS NOT NULL);

-- Keep all three columns in sync via trigger
CREATE OR REPLACE FUNCTION public.sync_stripe_customer_aliases()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Sync profile_id <-> user_id
  IF NEW.profile_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.user_id := NEW.profile_id;
  ELSIF NEW.user_id IS NOT NULL AND NEW.profile_id IS NULL THEN
    NEW.profile_id := NEW.user_id;
  END IF;

  -- Sync stripe_id <-> customer_id
  IF NEW.stripe_id IS NOT NULL AND NEW.customer_id IS NULL THEN
    NEW.customer_id := NEW.stripe_id;
  ELSIF NEW.customer_id IS NOT NULL AND NEW.stripe_id IS NULL THEN
    NEW.stripe_id := NEW.customer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stripe_customer_aliases ON public.stripe_customers;
CREATE TRIGGER trg_sync_stripe_customer_aliases
  BEFORE INSERT OR UPDATE ON public.stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.sync_stripe_customer_aliases();

-- 3. Create stripe_subscriptions table
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           text NOT NULL,
  subscription_id       text UNIQUE,
  price_id              text,
  status                text NOT NULL DEFAULT 'not_started',
  current_period_start  bigint,
  current_period_end    bigint,
  cancel_at_period_end  boolean DEFAULT false,
  payment_method_brand  text,
  payment_method_last4  text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view own stripe_subscriptions"
  ON public.stripe_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT COALESCE(customer_id, stripe_id)
      FROM public.stripe_customers
      WHERE profile_id = auth.uid() OR user_id = auth.uid()
    )
  );

-- 4. Trigger: stripe_subscriptions → profiles + subscriptions
CREATE OR REPLACE FUNCTION public.sync_subscription_to_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    uuid;
  v_period_end timestamptz;
  v_period_start timestamptz;
BEGIN
  -- Resolve profile from stripe_customers
  SELECT COALESCE(profile_id, user_id) INTO v_user_id
  FROM public.stripe_customers
  WHERE customer_id = NEW.customer_id
     OR stripe_id   = NEW.customer_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.current_period_end IS NOT NULL THEN
    v_period_end := to_timestamp(NEW.current_period_end);
  END IF;

  IF NEW.current_period_start IS NOT NULL THEN
    v_period_start := to_timestamp(NEW.current_period_start);
  END IF;

  -- Sync profiles
  UPDATE public.profiles
  SET
    subscription_status    = NEW.status,
    stripe_customer_id     = NEW.customer_id,
    stripe_subscription_id = COALESCE(NEW.subscription_id, stripe_subscription_id),
    current_period_end     = COALESCE(v_period_end, current_period_end),
    updated_at             = now()
  WHERE id = v_user_id;

  -- Upsert into subscriptions (used by is_premium_user + useSubscriptionStatus)
  IF NEW.subscription_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      profile_id,
      user_id,
      stripe_subscription_id,
      stripe_customer_id,
      status,
      current_period_start,
      current_period_end,
      updated_at
    )
    VALUES (
      v_user_id,
      v_user_id,
      NEW.subscription_id,
      NEW.customer_id,
      NEW.status,
      v_period_start,
      v_period_end,
      now()
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status               = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end   = EXCLUDED.current_period_end,
      user_id              = EXCLUDED.user_id,
      profile_id           = EXCLUDED.profile_id,
      updated_at           = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscription_to_profile ON public.stripe_subscriptions;
CREATE TRIGGER trg_sync_subscription_to_profile
  AFTER INSERT OR UPDATE ON public.stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_to_profile();

-- 5. Trigger: stripe_customers → profiles.stripe_customer_id
CREATE OR REPLACE FUNCTION public.sync_customer_to_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := COALESCE(NEW.profile_id, NEW.user_id);

  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      stripe_customer_id = COALESCE(NEW.customer_id, NEW.stripe_id),
      updated_at         = now()
    WHERE id = v_user_id
      AND (stripe_customer_id IS NULL OR stripe_customer_id = '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_to_profile ON public.stripe_customers;
CREATE TRIGGER trg_sync_customer_to_profile
  AFTER INSERT OR UPDATE ON public.stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_to_profile();
