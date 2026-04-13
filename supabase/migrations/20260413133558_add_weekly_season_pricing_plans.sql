/*
  # Add Weekly and Season Pricing Plans

  ## Summary
  Replaces the monthly/yearly Stripe plan entries with two new plans:
  - **Neeko+ Weekly** — $5.99 AUD recurring weekly subscription (plan_key: 'weekly')
  - **Neeko+ Season** — $59 AUD AUD one-time payment for full season access (plan_key: 'season')

  ## Changes
  - Removes old 'monthly' and 'yearly' entries from stripe_products_config
  - Inserts/updates 'weekly' entry: 599 cents, interval 'week'
  - Inserts/updates 'season' entry: 5900 cents, interval 'one_time'

  ## Notes
  - Price IDs must be set via the admin Stripe products config once created in Stripe dashboard
  - Placeholder price IDs are used here; update via migration once Stripe IDs are known
  - The stripe-checkout edge function reads plan_key from this table
  - interval='one_time' signals to the checkout function to use payment_intent mode
*/

DELETE FROM public.stripe_products_config WHERE plan_key IN ('monthly', 'yearly');

INSERT INTO public.stripe_products_config (plan_key, product_id, price_id, amount, currency, interval, label)
VALUES
  ('weekly', 'prod_weekly_placeholder', 'price_weekly_placeholder', 599,  'aud', 'week',     'Neeko+ Weekly'),
  ('season', 'prod_season_placeholder', 'price_season_placeholder', 5900, 'aud', 'one_time', 'Neeko+ Season')
ON CONFLICT (plan_key) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  price_id   = EXCLUDED.price_id,
  amount     = EXCLUDED.amount,
  currency   = EXCLUDED.currency,
  interval   = EXCLUDED.interval,
  label      = EXCLUDED.label;
