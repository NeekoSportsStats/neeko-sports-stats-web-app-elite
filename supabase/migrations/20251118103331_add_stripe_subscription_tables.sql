/*
  # Add Stripe Subscription Tables

  1. New Tables
    - `stripe_customers`
      - `user_id` (uuid, primary key, references auth.users)
      - `customer_id` (text, Stripe customer ID)
      - `created_at` (timestamptz)
    
    - `subscriptions`
      - `id` (text, primary key, Stripe subscription ID)
      - `user_id` (uuid, references auth.users)
      - `status` (text, subscription status)
      - `price_id` (text, Stripe price ID)
      - `current_period_end` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `stripe_events`
      - `id` (bigint, primary key)
      - `event_id` (text, unique, Stripe event ID)
      - `type` (text, event type)
      - `data` (jsonb, event data)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read their own data
    - Service role can manage all records via edge functions
*/

-- Create stripe_customers table
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own stripe customer data"
  ON stripe_customers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL,
  price_id text NOT NULL,
  current_period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription data"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create stripe_events table (for webhook idempotency)
CREATE TABLE IF NOT EXISTS stripe_events (
  id bigserial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- No read policies for stripe_events - only service role should access
