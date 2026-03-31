-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Anyone can view free ai_insights" ON public.ai_insights;

-- Create new policy that allows everyone to see all ai_insights
-- The frontend will handle blur logic for premium content
CREATE POLICY "Anyone can view all ai_insights"
ON public.ai_insights
FOR SELECT
TO public
USING (true);