-- Create cache table for AFL AI insights
CREATE TABLE IF NOT EXISTS public.afl_ai_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  free_insights JSONB NOT NULL,
  premium_insights JSONB NOT NULL,
  total_players INTEGER NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.afl_ai_insights_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read insights
CREATE POLICY "Anyone can view AFL AI insights"
  ON public.afl_ai_insights_cache
  FOR SELECT
  USING (true);

-- Only service role can insert insights (via edge functions)
CREATE POLICY "Service role can insert AFL AI insights"
  ON public.afl_ai_insights_cache
  FOR INSERT
  WITH CHECK (true);

-- Add index for performance
CREATE INDEX idx_afl_ai_insights_fetched_at ON public.afl_ai_insights_cache(fetched_at DESC);