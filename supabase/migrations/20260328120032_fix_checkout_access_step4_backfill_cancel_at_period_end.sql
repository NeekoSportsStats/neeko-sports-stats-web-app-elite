/*
  # Fix Step 4: Backfill cancel_at_period_end into subscriptions from stripe_subscriptions

  ## Problem
  The subscriptions table now has cancel_at_period_end but existing rows have DEFAULT false.
  The active user (cus_U9kFt5VYSklvAK / sub_1TBQqcEKV8332a9YwRjKjhPd) has
  cancel_at_period_end = true in stripe_subscriptions, which must be backfilled.

  ## Changes
  - Backfills cancel_at_period_end on all existing subscriptions rows
    by joining to stripe_subscriptions on subscription_id
  - Safe: only updates, no deletes, no schema changes
*/

UPDATE public.subscriptions s
SET cancel_at_period_end = COALESCE(ss.cancel_at_period_end, false)
FROM public.stripe_subscriptions ss
WHERE ss.subscription_id = s.stripe_subscription_id
  AND ss.cancel_at_period_end IS NOT NULL;
