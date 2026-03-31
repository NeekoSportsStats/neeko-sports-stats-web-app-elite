-- Add subscription fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'paused', 'cancelled', 'inactive')),
ADD COLUMN IF NOT EXISTS billing_period_start timestamp with time zone,
ADD COLUMN IF NOT EXISTS billing_period_end timestamp with time zone,
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Create ai_insights table to store generated insights for all sports
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sport text NOT NULL CHECK (sport IN ('AFL', 'NRL', 'EPL', 'NBA')),
  top_insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  free_insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  premium_insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(sport)
);

-- Enable RLS
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read insights
CREATE POLICY "Anyone can view ai insights"
ON public.ai_insights
FOR SELECT
USING (true);

-- Only authenticated users can update (we'll check admin in edge function)
CREATE POLICY "Authenticated users can update insights"
ON public.ai_insights
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_insights_sport ON public.ai_insights(sport);
CREATE INDEX IF NOT EXISTS idx_ai_insights_updated_at ON public.ai_insights(updated_at DESC);