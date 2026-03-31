/*
  # Update stripe_products_config with new canonical price IDs

  ## Summary
  Replaces the product_id and price_id for both monthly and yearly plans
  with the newly created Stripe objects that match the standardised
  NEEKO_PRICING config ($9.99 AUD/month, $89 AUD/year).

  ## Changes
  - monthly: new product_id prod_U5CwtEQ9BBHbio, price_id price_1T72WaEKV8332a9YpvrXKyzt
  - yearly:  new product_id prod_U5CwubA9tpBGiC, price_id price_1T72WbEKV8332a9YcxV9qH4b
  - Amounts confirmed: 999 (monthly), 8900 (yearly)

  ## Notes
  - No rows are deleted; we update in-place using plan_key as the lookup key.
*/

UPDATE stripe_products_config
SET
  product_id = 'prod_U5CwtEQ9BBHbio',
  price_id   = 'price_1T72WaEKV8332a9YpvrXKyzt',
  amount     = 999,
  currency   = 'aud',
  interval   = 'month',
  label      = 'Neeko+ Monthly'
WHERE plan_key = 'monthly';

UPDATE stripe_products_config
SET
  product_id = 'prod_U5CwubA9tpBGiC',
  price_id   = 'price_1T72WbEKV8332a9YcxV9qH4b',
  amount     = 8900,
  currency   = 'aud',
  interval   = 'year',
  label      = 'Neeko+ Yearly'
WHERE plan_key = 'yearly';
