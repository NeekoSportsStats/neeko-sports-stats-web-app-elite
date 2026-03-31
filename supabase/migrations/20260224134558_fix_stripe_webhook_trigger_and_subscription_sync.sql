/*
  # Fix Stripe webhook trigger and subscription sync

  ## Problem Summary
  The handle_stripe_event trigger was:
  1. Writing to subscriptions.profile_id but leaving subscriptions.user_id NULL
  2. Never updating profiles.subscription_status
  3. The is_premium_user() function checks subscriptions.user_id — so it never matched
  4. The auth layer checks profiles.subscription_status — so premium never activated

  ## Changes
  1. Rebuild handle_stripe_event to:
     - Populate BOTH profile_id AND user_id in subscriptions
     - Update profiles.subscription_status to 'active'/'canceled' etc on every event
     - Handle checkout.session.completed to also set stripe_subscription_id on profiles
  2. Backfill existing subscriptions rows that have profile_id but null user_id
  3. Backfill profiles.subscription_status for any active subscription rows
*/

-- 1. Fix existing subscriptions rows that have profile_id but null user_id
UPDATE public.subscriptions
SET user_id = profile_id
WHERE user_id IS NULL AND profile_id IS NOT NULL;

-- 2. Backfill profiles.subscription_status from subscriptions where it is missing
UPDATE public.profiles p
SET subscription_status = s.status
FROM public.subscriptions s
WHERE (s.user_id = p.id OR s.profile_id = p.id)
  AND (p.subscription_status IS NULL OR p.subscription_status = 'free')
  AND s.status IN ('active', 'trialing');

-- 3. Rebuild the handle_stripe_event trigger function to fix all paths
CREATE OR REPLACE FUNCTION public.handle_stripe_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_type text;
  data jsonb;
  subscription_id text;
  customer_id text;
  sub_status text;
  period_end timestamptz;
  period_start timestamptz;
  profile_uuid uuid;
BEGIN
  event_type := new.payload->>'type';
  data := new.payload->'data'->'object';

  -- Handle subscription lifecycle events
  IF event_type LIKE 'customer.subscription.%' THEN
    subscription_id := data->>'id';
    customer_id     := data->>'customer';
    sub_status      := data->>'status';
    period_end      := to_timestamp((data->>'current_period_end')::numeric);
    period_start    := to_timestamp((data->>'current_period_start')::numeric);

    -- Resolve profile from stripe_customer_id
    SELECT id INTO profile_uuid
    FROM public.profiles
    WHERE stripe_customer_id = customer_id
    LIMIT 1;

    IF profile_uuid IS NOT NULL THEN
      -- Upsert into subscriptions with BOTH profile_id and user_id populated
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
        profile_uuid,
        profile_uuid,
        subscription_id,
        customer_id,
        sub_status,
        period_start,
        period_end,
        now()
      )
      ON CONFLICT (stripe_subscription_id)
      DO UPDATE SET
        status               = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end   = EXCLUDED.current_period_end,
        user_id              = EXCLUDED.user_id,
        profile_id           = EXCLUDED.profile_id,
        updated_at           = now();

      -- Sync profiles.subscription_status
      UPDATE public.profiles
      SET
        subscription_status    = sub_status,
        stripe_subscription_id = subscription_id,
        current_period_end     = period_end,
        updated_at             = now()
      WHERE id = profile_uuid;
    END IF;
  END IF;

  -- Handle checkout.session.completed — store stripe_customer_id on profile
  IF event_type = 'checkout.session.completed' THEN
    customer_id     := data->>'customer';
    subscription_id := data->>'subscription';

    -- Try to match by customer_id first, then by user metadata
    SELECT id INTO profile_uuid
    FROM public.profiles
    WHERE stripe_customer_id = customer_id
    LIMIT 1;

    -- Fallback: match via client_reference_id (Supabase user id passed during checkout)
    IF profile_uuid IS NULL THEN
      DECLARE
        client_ref text := data->>'client_reference_id';
      BEGIN
        IF client_ref IS NOT NULL THEN
          SELECT id INTO profile_uuid
          FROM public.profiles
          WHERE id = client_ref::uuid
          LIMIT 1;
        END IF;
      END;
    END IF;

    IF profile_uuid IS NOT NULL THEN
      UPDATE public.profiles
      SET
        stripe_customer_id     = customer_id,
        stripe_subscription_id = COALESCE(subscription_id, stripe_subscription_id),
        updated_at             = now()
      WHERE id = profile_uuid;
    END IF;
  END IF;

  RETURN new;
END;
$$;
