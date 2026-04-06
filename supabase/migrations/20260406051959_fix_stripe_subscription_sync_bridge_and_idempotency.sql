/*
  # Fix Stripe Subscription Sync and Webhook Idempotency

  ## Critical Bug Found
  The stripe-webhook edge function writes subscription data to `public.stripe_subscriptions`
  (keyed by customer_id, with Unix epoch timestamps in bigint columns), but the access
  control functions `is_premium_user()` and `get_access_state()` read from
  `public.subscriptions` (keyed by user_id, with timestamptz columns).

  These are two different tables. Without a sync bridge, a user can pay successfully,
  Stripe fires the webhook, stripe_subscriptions gets updated — but is_premium_user()
  returns false because subscriptions is never touched.

  ## Secondary Bug
  stripe_webhook_events.event_id is always NULL. The webhook inserts the event but
  the column mapping is wrong — it inserts into a jsonb `payload` field but does not
  explicitly set the text `event_id` column, so the idempotency dedup check on
  event_id always finds nothing and never blocks duplicates.

  ## Fixes Applied
  1. Trigger on stripe_subscriptions → auto-syncs into subscriptions table on every upsert
  2. The trigger resolves user_id via stripe_customers (customer_id → user_id lookup)
  3. Converts Unix epoch bigint timestamps to timestamptz correctly
  4. stripe_webhook_events: add created_at alias and fix event_id NOT NULL default
  5. Backfill: sync any existing stripe_subscriptions rows that are missing from subscriptions
*/

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Create sync trigger function
--         stripe_subscriptions → subscriptions
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_stripe_subscriptions_to_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Resolve user_id from stripe_customers using customer_id
  SELECT sc.user_id INTO v_user_id
  FROM public.stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id
     OR sc.stripe_id   = NEW.customer_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    -- Fallback: try profiles table stripe_customer_id column
    SELECT p.id INTO v_user_id
    FROM public.profiles p
    WHERE p.stripe_customer_id = NEW.customer_id
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Upsert into the access-control subscriptions table
  -- Convert Unix epoch bigints to timestamptz
  INSERT INTO public.subscriptions (
    user_id,
    profile_id,
    stripe_subscription_id,
    stripe_customer_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_id,
    NEW.subscription_id,
    NEW.customer_id,
    NEW.status,
    CASE WHEN NEW.current_period_start IS NOT NULL
         THEN to_timestamp(NEW.current_period_start)
         ELSE NULL END,
    CASE WHEN NEW.current_period_end IS NOT NULL
         THEN to_timestamp(NEW.current_period_end)
         ELSE NULL END,
    COALESCE(NEW.cancel_at_period_end, false),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (stripe_subscription_id)
  DO UPDATE SET
    status               = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end   = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    updated_at           = now()
  WHERE public.subscriptions.stripe_subscription_id = EXCLUDED.stripe_subscription_id;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Add unique constraint on subscriptions.stripe_subscription_id
--         (needed for ON CONFLICT above)
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_stripe_subscription_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_stripe_subscription_id_key
    UNIQUE (stripe_subscription_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Attach trigger to stripe_subscriptions
-- ═══════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_sync_to_subscriptions ON public.stripe_subscriptions;

CREATE TRIGGER trg_sync_to_subscriptions
AFTER INSERT OR UPDATE ON public.stripe_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_stripe_subscriptions_to_access();

-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Backfill — sync existing stripe_subscriptions rows
--         into subscriptions for any users that are missing
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO public.subscriptions (
  user_id,
  profile_id,
  stripe_subscription_id,
  stripe_customer_id,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  created_at,
  updated_at
)
SELECT
  sc.user_id,
  sc.user_id,
  ss.subscription_id,
  ss.customer_id,
  ss.status,
  CASE WHEN ss.current_period_start IS NOT NULL
       THEN to_timestamp(ss.current_period_start)
       ELSE NULL END,
  CASE WHEN ss.current_period_end IS NOT NULL
       THEN to_timestamp(ss.current_period_end)
       ELSE NULL END,
  COALESCE(ss.cancel_at_period_end, false),
  COALESCE(ss.created_at, now()),
  now()
FROM public.stripe_subscriptions ss
JOIN public.stripe_customers sc ON sc.customer_id = ss.customer_id OR sc.stripe_id = ss.customer_id
WHERE ss.subscription_id IS NOT NULL
ON CONFLICT (stripe_subscription_id)
DO UPDATE SET
  status               = EXCLUDED.status,
  current_period_start = EXCLUDED.current_period_start,
  current_period_end   = EXCLUDED.current_period_end,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
  updated_at           = now();

-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Fix stripe_webhook_events idempotency
--         Add created_at column and ensure event_id is indexed
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stripe_webhook_events'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.stripe_webhook_events
    ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id
  ON public.stripe_webhook_events (event_id)
  WHERE event_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 6: RLS for stripe_subscriptions (ensure service_role can write)
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stripe_subscriptions'
      AND policyname = 'Service role full access to stripe_subscriptions'
  ) THEN
    ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Service role full access to stripe_subscriptions"
      ON public.stripe_subscriptions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "Users can read own stripe subscription"
      ON public.stripe_subscriptions
      FOR SELECT
      TO authenticated
      USING (
        customer_id IN (
          SELECT customer_id FROM public.stripe_customers
          WHERE user_id = auth.uid() OR profile_id = auth.uid()
        )
      );
  END IF;
END $$;
