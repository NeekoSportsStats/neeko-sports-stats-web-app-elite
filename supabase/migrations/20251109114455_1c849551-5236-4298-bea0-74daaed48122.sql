-- Create afl_stats table for storing player statistics
CREATE TABLE IF NOT EXISTS public.afl_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player text NOT NULL,
  team text,
  round integer,
  goals integer,
  disposals integer,
  tackles integer,
  marks integer,
  hitouts integer,
  fantasy_score integer,
  updated_at timestamp with time zone DEFAULT now()
);

-- Create ai_insights table for storing AI-generated analysis blocks
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_type text NOT NULL,
  block_title text NOT NULL,
  player text NOT NULL,
  explanation text NOT NULL,
  stats jsonb DEFAULT '{}'::jsonb,
  sparkline jsonb DEFAULT '[]'::jsonb,
  rank integer,
  is_premium boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.afl_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- RLS policies for afl_stats (read-only for everyone, write for service role)
CREATE POLICY "Anyone can view afl_stats"
  ON public.afl_stats
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert afl_stats"
  ON public.afl_stats
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Service role can update afl_stats"
  ON public.afl_stats
  FOR UPDATE
  USING (false);

CREATE POLICY "Service role can delete afl_stats"
  ON public.afl_stats
  FOR DELETE
  USING (false);

-- RLS policies for ai_insights
CREATE POLICY "Anyone can view free ai_insights"
  ON public.ai_insights
  FOR SELECT
  USING (is_premium = false OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_premium = true
  ));

CREATE POLICY "Only admins can insert ai_insights"
  ON public.ai_insights
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update ai_insights"
  ON public.ai_insights
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete ai_insights"
  ON public.ai_insights
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_afl_stats_player ON public.afl_stats(player);
CREATE INDEX IF NOT EXISTS idx_afl_stats_round ON public.afl_stats(round);
CREATE INDEX IF NOT EXISTS idx_ai_insights_block_type ON public.ai_insights(block_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_is_premium ON public.ai_insights(is_premium);