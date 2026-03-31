/*
  # Update stripe_products_config — correct AUD pricing

  Updates the monthly and yearly plan amounts to match the intended pricing:
  - Monthly: $9.99 AUD (999 cents)
  - Yearly:  $89.00 AUD (8900 cents)

  No schema changes. Data update only.
*/

UPDATE stripe_products_config
SET amount = 999, label = 'Neeko+ Monthly'
WHERE plan_key = 'monthly';

UPDATE stripe_products_config
SET amount = 8900, label = 'Neeko+ Yearly'
WHERE plan_key = 'yearly';
