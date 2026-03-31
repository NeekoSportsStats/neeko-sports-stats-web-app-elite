-- Add missing RLS policies for afl_stats_cache table
-- Only service role should be able to insert/update/delete cache data

CREATE POLICY "Only service role can insert stats cache"
  ON afl_stats_cache FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only service role can update stats cache"
  ON afl_stats_cache FOR UPDATE
  USING (false);

CREATE POLICY "Only service role can delete stats cache"
  ON afl_stats_cache FOR DELETE
  USING (false);

-- Add missing RLS policies for afl_ai_insights_cache table
-- Only service role should be able to update/delete cache data

CREATE POLICY "Only service role can update AFL AI insights cache"
  ON afl_ai_insights_cache FOR UPDATE
  USING (false);

CREATE POLICY "Only service role can delete AFL AI insights cache"
  ON afl_ai_insights_cache FOR DELETE
  USING (false);