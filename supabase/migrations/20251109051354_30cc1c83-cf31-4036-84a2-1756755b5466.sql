-- Fix premium access control policy on ai_insights_premium
-- Replace user_sessions check with profiles.is_premium check

DROP POLICY IF EXISTS "Only premium users can view premium insights" ON ai_insights_premium;

CREATE POLICY "Only premium users can view premium insights"
ON ai_insights_premium
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.is_premium = true
  )
);