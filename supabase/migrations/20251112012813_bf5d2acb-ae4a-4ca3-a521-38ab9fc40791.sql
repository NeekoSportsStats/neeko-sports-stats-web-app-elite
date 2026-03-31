-- Create ai_analysis_queue table
CREATE TABLE IF NOT EXISTS public.ai_analysis_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL CHECK (sport IN ('afl', 'nba', 'epl')),
  player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ai_analysis_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can manage queue
CREATE POLICY "Only admins can manage ai analysis queue"
ON public.ai_analysis_queue
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queue processing
CREATE INDEX idx_ai_analysis_queue_status ON public.ai_analysis_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_ai_analysis_queue_sport ON public.ai_analysis_queue(sport);

-- Enable realtime for live dashboard updates
ALTER TABLE public.ai_analysis_queue REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_analysis_queue;

-- View 1: Queue Status
CREATE OR REPLACE VIEW ai_queue_status_view AS
SELECT
  sport,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'processing') AS processing,
  COUNT(*) FILTER (WHERE status = 'done') AS done,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) AS total
FROM ai_analysis_queue
GROUP BY sport;

-- View 2: Queue Progress
CREATE OR REPLACE VIEW ai_queue_progress_view AS
SELECT
  sport,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'done') / NULLIF(COUNT(*), 0), 2) AS completion_percent
FROM ai_analysis_queue
GROUP BY sport
UNION ALL
SELECT
  'TOTAL' AS sport,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'done') / NULLIF(COUNT(*), 0), 2) AS completion_percent
FROM ai_analysis_queue;

-- View 3: Queue Performance
CREATE OR REPLACE VIEW ai_queue_performance_view AS
SELECT
  sport,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 2) AS avg_generation_time_seconds
FROM ai_analysis_queue
WHERE status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL
GROUP BY sport;