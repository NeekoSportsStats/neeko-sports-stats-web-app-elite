/*
  # Checkout Hardening Phase 2 — Fix Overloads, Backfill, Webhook Safety

  ## Changes

  1. Drop stale `is_premium_user(uuid)` overload
     - The old overload takes a user_id argument and uses broken logic (only checks status='active',
       misses canceled-but-within-period users)
     - The correct zero-arg version using auth.uid() is already in place from Phase 1
     - Removing the stale overload prevents ambiguity

  2. Backfill plan_type on existing subscriptions
     - Season-pass rows have stripe_subscription_id starting with 'season_'
     - All other active/canceled rows are assumed weekly
     - NULL plan_type rows are updated accordingly

  3. Fix stripe_subscriptions upsert conflict target
     - Current conflict target is 'customer_id' — means one customer can only ever have
       ONE row in stripe_subscriptions, clobbering when plan changes
     - Add a unique index on subscription_id instead so each subscription gets its own row
     - This is a raw Stripe mirror table; keying by subscription_id is correct

  4. Ensure subscriptions table has unique index on stripe_subscription_id
     - Required for the upsert onConflict in the webhook to work correctly

  5. Ensure stripe_webhook_events has processed_at column
     - Webhook marks events as processed but column may not exist on all envs
*/

-- 1. Drop the stale is_premium_user(uuid) overload
DROP FUNCTION IF EXISTS public.is_premium_user(uuid);

-- 2. Backfill plan_type on existing subscriptions
UPDATE public.subscriptions
SET plan_type = 'season'
WHERE plan_type IS NULL
  AND stripe_subscription_id LIKE 'season_%';

UPDATE public.subscriptions
SET plan_type = 'weekly'
WHERE plan_type IS NULL
  AND stripe_subscription_id NOT LIKE 'season_%'
  AND stripe_subscription_id IS NOT NULL;

-- 3. Ensure subscriptions has a unique index on stripe_subscription_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'subscriptions'
      AND indexname = 'subscriptions_stripe_subscription_id_key'
  ) THEN
    -- Check if there are duplicates first
    IF NOT EXISTS (
      SELECT stripe_subscription_id
      FROM public.subscriptions
      WHERE stripe_subscription_id IS NOT NULL
      GROUP BY stripe_subscription_id
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key
        ON public.subscriptions(stripe_subscription_id)
        WHERE stripe_subscription_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- 4. Ensure stripe_subscriptions can handle multiple subscriptions per customer
--    Add unique index on subscription_id (not customer_id) for correct upsert behavior
DO $$
BEGIN
  -- Add subscription_id column if missing (some envs may not have it)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_subscriptions' AND column_name = 'subscription_id'
  ) THEN
    ALTER TABLE public.stripe_subscriptions ADD COLUMN subscription_id text;
  END IF;

  -- Add unique index on subscription_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'stripe_subscriptions'
      AND indexname = 'stripe_subscriptions_subscription_id_key'
  ) THEN
    IF NOT EXISTS (
      SELECT subscription_id
      FROM public.stripe_subscriptions
      WHERE subscription_id IS NOT NULL
      GROUP BY subscription_id
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX stripe_subscriptions_subscription_id_key
        ON public.stripe_subscriptions(subscription_id)
        WHERE subscription_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- 5. Ensure stripe_webhook_events has processed_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stripe_webhook_events' AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE public.stripe_webhook_events ADD COLUMN processed_at timestamptz;
  END IF;
END $$;

-- 6. Grant execute on is_premium_user (no args) to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.is_premium_user() TO authenticated, anon;

-- 7. Grant execute on get_access_state to authenticated and anon
GRANT EXECUTE ON FUNCTION public.get_access_state() TO authenticated, anon;
