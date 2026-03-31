-- Create ai_jobs_queue table for background AI processing
CREATE TABLE IF NOT EXISTS public.ai_jobs_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  sport TEXT NOT NULL CHECK (sport IN ('afl', 'nba', 'epl')),
  block_type TEXT NOT NULL,
  block_title TEXT NOT NULL,
  player_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ai_jobs_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can manage queue
CREATE POLICY "Only admins can manage ai jobs queue"
ON public.ai_jobs_queue
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queue processing
CREATE INDEX idx_ai_jobs_queue_status_created ON public.ai_jobs_queue(status, created_at) WHERE status = 'pending';

-- Create trigger for updated_at
CREATE TRIGGER update_ai_jobs_queue_updated_at
BEFORE UPDATE ON public.ai_jobs_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule process-ai-queue to run every 5 minutes
SELECT cron.schedule(
  'process-ai-queue-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ghrbxldpuctygxaiqwdv.supabase.co/functions/v1/process-ai-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdocmJ4bGRwdWN0eWd4YWlxd2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDc0ODcsImV4cCI6MjA3OTEyMzQ4N30.F0hMkqhE2ZDxB9SETl6jiZAugpN4OE0Nxbq2bWPpNBE"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) as request_id;
  $$
);