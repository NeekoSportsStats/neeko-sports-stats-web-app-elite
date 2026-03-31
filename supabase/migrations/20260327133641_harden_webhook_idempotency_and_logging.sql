
/*
  # Harden Stripe Webhook: Idempotency + Logging

  ## Summary
  Ensures the stripe_webhook_events table exists with a unique constraint on event_id
  so duplicate webhook deliveries from Stripe are safely deduplicated.

  ## Changes
  1. Creates stripe_webhook_events table if it doesn't exist
     - event_id: Stripe event ID (unique) — prevents duplicate processing
     - event_type: e.g. checkout.session.completed
     - processed_at: timestamp of first successful processing
     - payload: full event JSON for debugging
  2. Adds unique index on event_id for fast deduplication lookups
  3. RLS: only service_role can read/write (no public access)
*/

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stripe_webhook_events'
      AND constraint_name = 'stripe_webhook_events_event_id_key'
  ) THEN
    ALTER TABLE public.stripe_webhook_events
      ADD CONSTRAINT stripe_webhook_events_event_id_key UNIQUE (event_id);
  END IF;
END $$;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "service_role_all_webhook_events"
  ON public.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
