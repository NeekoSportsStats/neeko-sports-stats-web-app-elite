/*
  # Fix Step 1: Trigger fn_sync_subscription_to_profile now writes to subscriptions table

  ## Problem
  The trigger trg_sync_subscription_to_profile fires fn_sync_subscription_to_profile
  on stripe_subscriptions INSERT/UPDATE. The old body only updated profiles — it never
  wrote to the public.subscriptions table. is_premium_user() reads subscriptions, so
  premium status was stale / wrong for any user whose subscription changed after initial
  row creation.

  ## Changes
  - Replaces fn_sync_subscription_to_profile body to:
    1. Still update profiles (mirror — cancel_at_period_end, subscription_status, etc.)
    2. NOW ALSO upsert into public.subscriptions (source of truth for is_premium_user)
  - No schema changes — only function body replacement
  - Existing trigger wiring is unchanged (already fires AFTER INSERT/UPDATE)

  ## Tables affected
  - stripe_subscriptions (trigger source — unchanged)
  - profiles (mirror — now also sets cancel_at_period_end)
  - subscriptions (now populated by this path)
*/

CREATE OR REPLACE FUNCTION public.fn_sync_subscription_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id      uuid;
  v_is_active    boolean;
  v_period_end   timestamptz;
  v_period_start timestamptz;
BEGIN
  -- Resolve user from stripe_customers (support both column name variants)
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
  END IF;

  IF NEW.current_period_start IS NOT NULL THEN
    v_period_start := to_timestamp(NEW.current_period_start);
  END IF;

  -- 1. Update profiles mirror
  UPDATE public.profiles
  SET
    is_active              = v_is_active,
    plan                   = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
    subscription_status    = NEW.status,
    subscription_tier      = CASE WHEN v_is_active THEN 'premium' ELSE 'free' END,
    stripe_customer_id     = NEW.customer_id,
    stripe_subscription_id = COALESCE(NEW.subscription_id, stripe_subscription_id),
    current_period_end     = COALESCE(v_period_end, current_period_end),
    cancel_at_period_end   = COALESCE(NEW.cancel_at_period_end, false),
    updated_at             = now()
  WHERE id = v_user_id;

  -- 2. Upsert into subscriptions (source of truth read by is_premium_user)
  --    Only when we have a real subscription_id
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
      stripe_customer_id   = EXCLUDED.stripe_customer_id,
      updated_at           = now();
  END IF;

  RETURN NEW;
END;
$$;
