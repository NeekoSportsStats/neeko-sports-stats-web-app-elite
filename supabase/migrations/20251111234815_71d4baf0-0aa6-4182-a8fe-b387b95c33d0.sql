-- Create sync_logs table for tracking all sync operations
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  sport TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running',
  records_processed INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  duration_seconds NUMERIC,
  triggered_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view sync logs"
ON public.sync_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Service role can insert logs
CREATE POLICY "Service role can insert sync logs"
ON public.sync_logs
FOR INSERT
WITH CHECK (true);

-- Service role can update logs
CREATE POLICY "Service role can update sync logs"
ON public.sync_logs
FOR UPDATE
USING (true);

-- Create index for faster queries
CREATE INDEX idx_sync_logs_operation ON public.sync_logs(operation);
CREATE INDEX idx_sync_logs_status ON public.sync_logs(status);
CREATE INDEX idx_sync_logs_started_at ON public.sync_logs(started_at DESC);
CREATE INDEX idx_sync_logs_sport ON public.sync_logs(sport);