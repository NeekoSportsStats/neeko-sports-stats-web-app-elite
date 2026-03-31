-- Update ai_insights_premium policy to allow everyone to see premium insights
-- The frontend will handle the blur logic for non-premium users
DROP POLICY IF EXISTS "Only premium users can view premium insights" ON public.ai_insights_premium;

CREATE POLICY "Anyone can view premium insights"
ON public.ai_insights_premium
FOR SELECT
TO public
USING (true);