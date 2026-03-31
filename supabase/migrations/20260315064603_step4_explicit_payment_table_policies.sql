/*
  # Step 4 — Explicit policies for payment tables

  ## Problem
  Four payment tables had RLS enabled (with FORCE) but ZERO policies defined.
  With RLS enabled and no policies, the default-deny is in effect for all roles
  EXCEPT service_role (which bypasses RLS by default in Supabase).
  
  This means:
  - stripe_webhook/event processing via service_role: works correctly
  - Users trying to view their own customer record: blocked (correct for now)
  - But the posture is ambiguous — no explicit intent documented

  ## Tables
  - public.stripe_customers        — maps user → Stripe customer_id
  - public.stripe_events           — raw Stripe event log (webhook-only writes)
  - public.stripe_webhook_events   — deduplicated webhook event store
  - public.payments                — payment records

  ## Access design
  - stripe_customers: user can read their OWN row (to display billing info)
  - stripe_events: service_role only (raw webhook log, no user access needed)
  - stripe_webhook_events: service_role only (deduplication store, internal only)
  - payments: user can read their OWN payments (linked via stripe_customer_id)

  ## Notes
  - FORCE ROW SECURITY is already set on these tables — maintained as-is
  - No user should be able to INSERT/UPDATE payment data — service_role/webhook only
  - The Billing page queries stripe_customers and stripe_subscriptions — this is preserved
*/

-- ============================================================
-- stripe_customers — users can read their own row
-- ============================================================
CREATE POLICY "Users can read own stripe customer record"
  ON public.stripe_customers FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "Service role full access to stripe_customers"
  ON public.stripe_customers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- stripe_events — service role only (raw webhook log)
-- ============================================================
CREATE POLICY "Service role full access to stripe_events"
  ON public.stripe_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- stripe_webhook_events — service role only (internal deduplication)
-- ============================================================
CREATE POLICY "Service role full access to stripe_webhook_events"
  ON public.stripe_webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- payments — users can read payments associated with their customer record
-- ============================================================
CREATE POLICY "Users can read own payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    stripe_customer_id IN (
      SELECT COALESCE(customer_id, stripe_id)
      FROM public.stripe_customers
      WHERE profile_id = auth.uid() OR user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to payments"
  ON public.payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
