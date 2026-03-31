-- Create user_sessions table for server-managed Shopify sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  shopify_customer_id TEXT NOT NULL,
  shopify_customer_email TEXT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  encrypted_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_validated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own session
CREATE POLICY "Users view own sessions"
  ON public.user_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update sessions (done via Edge Functions)
CREATE POLICY "Service role manages sessions"
  ON public.user_sessions FOR ALL
  USING (false)
  WITH CHECK (false);

-- Update RLS policy on ai_insights_premium to check sessions
DROP POLICY IF EXISTS "Only premium users can view premium insights" ON public.ai_insights_premium;

CREATE POLICY "Only premium users can view premium insights"
  ON public.ai_insights_premium FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_sessions
      WHERE user_sessions.user_id = auth.uid()
        AND user_sessions.is_premium = true
        AND user_sessions.expires_at > now()
    )
  );