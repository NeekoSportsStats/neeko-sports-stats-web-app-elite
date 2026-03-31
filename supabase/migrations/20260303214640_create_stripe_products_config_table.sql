
/*
  # Stripe Products Config Table

  ## Purpose
  Stores Stripe product and price IDs for Neeko+ subscription plans.
  Frontend and edge functions read from this table to get the correct price IDs
  for checkout sessions, avoiding hardcoded IDs in code.

  ## New Tables
  - `stripe_products_config`
    - `id` (uuid, primary key)
    - `plan_key` (text, unique) — e.g. 'monthly', 'yearly'
    - `product_id` (text) — Stripe product ID
    - `price_id` (text) — Stripe price ID
    - `amount` (integer) — amount in cents
    - `currency` (text) — e.g. 'aud'
    - `interval` (text) — 'month' or 'year'
    - `label` (text) — display name
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Public read (anon) — price IDs are not secret, they are used in frontend checkout
  - No public write — only service role can modify
*/

CREATE TABLE IF NOT EXISTS public.stripe_products_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text UNIQUE NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'aud',
  interval text NOT NULL,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.stripe_products_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read stripe product config"
  ON public.stripe_products_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.stripe_products_config (plan_key, product_id, price_id, amount, currency, interval, label)
VALUES
  ('monthly', 'prod_U5B86tElKCkVLG', 'price_1T70lqEKV8332a9YTnS3kZGQ', 1299, 'aud', 'month', 'Neeko+ Monthly'),
  ('yearly',  'prod_U5B8kI21KYpC3v', 'price_1T70lqEKV8332a9Y1yiGTbCY', 11900, 'aud', 'year',  'Neeko+ Yearly')
ON CONFLICT (plan_key) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  price_id   = EXCLUDED.price_id,
  amount     = EXCLUDED.amount,
  currency   = EXCLUDED.currency,
  interval   = EXCLUDED.interval,
  label      = EXCLUDED.label;
