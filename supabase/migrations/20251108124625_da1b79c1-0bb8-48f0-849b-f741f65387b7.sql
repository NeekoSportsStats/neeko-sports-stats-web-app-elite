-- Split ai_insights into public and premium tables for proper access control
-- This fixes the PUBLIC_DATA_EXPOSURE security vulnerability

-- Create public insights table (accessible to everyone)
CREATE TABLE IF NOT EXISTS public.ai_insights_public (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL UNIQUE,
  top_insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  free_insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ai_insights_public_sport_check CHECK (sport IN ('AFL', 'NRL', 'EPL', 'NBA'))
);

-- Create premium insights table (only accessible to premium users)
CREATE TABLE IF NOT EXISTS public.ai_insights_premium (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL UNIQUE,
  premium_insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT ai_insights_premium_sport_check CHECK (sport IN ('AFL', 'NRL', 'EPL', 'NBA'))
);

-- Enable RLS on both tables
ALTER TABLE public.ai_insights_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights_premium ENABLE ROW LEVEL SECURITY;

-- Public insights: anyone can read
CREATE POLICY "Anyone can view public insights"
  ON public.ai_insights_public FOR SELECT
  USING (true);

-- Premium insights: only premium users can read
CREATE POLICY "Only premium users can view premium insights"
  ON public.ai_insights_premium FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_premium = true
    )
  );

-- Only admins can write to both tables
CREATE POLICY "Only admins can insert public insights"
  ON public.ai_insights_public FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update public insights"
  ON public.ai_insights_public FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert premium insights"
  ON public.ai_insights_premium FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update premium insights"
  ON public.ai_insights_premium FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing data from old ai_insights table
INSERT INTO public.ai_insights_public (sport, top_insights, free_insights, updated_at)
SELECT sport, top_insights, free_insights, updated_at
FROM public.ai_insights
ON CONFLICT (sport) DO UPDATE
SET top_insights = EXCLUDED.top_insights,
    free_insights = EXCLUDED.free_insights,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.ai_insights_premium (sport, premium_insights, updated_at)
SELECT sport, premium_insights, updated_at
FROM public.ai_insights
ON CONFLICT (sport) DO UPDATE
SET premium_insights = EXCLUDED.premium_insights,
    updated_at = EXCLUDED.updated_at;

-- Drop old table (keeping it for now, will deprecate after testing)
-- DROP TABLE public.ai_insights;

-- Create system locks table for rate limiting
CREATE TABLE IF NOT EXISTS public.system_locks (
  operation TEXT PRIMARY KEY,
  locked BOOLEAN NOT NULL DEFAULT false,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_locks ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage locks
CREATE POLICY "Only admins can view locks"
  ON public.system_locks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage locks"
  ON public.system_locks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger to update updated_at
CREATE TRIGGER update_ai_insights_public_updated_at
  BEFORE UPDATE ON public.ai_insights_public
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_insights_premium_updated_at
  BEFORE UPDATE ON public.ai_insights_premium
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_system_locks_updated_at
  BEFORE UPDATE ON public.system_locks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();