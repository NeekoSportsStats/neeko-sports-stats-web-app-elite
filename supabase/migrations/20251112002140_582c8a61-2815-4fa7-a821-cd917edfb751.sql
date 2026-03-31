-- Fix premium content bypass by adding proper RLS policies
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view ai_afl_analysis" ON ai_afl_analysis;
DROP POLICY IF EXISTS "Anyone can view ai_nba_analysis" ON ai_nba_analysis;
DROP POLICY IF EXISTS "Anyone can view ai_epl_analysis" ON ai_epl_analysis;

-- Create secure policies that enforce premium access server-side
-- For ai_afl_analysis
CREATE POLICY "Users can view free AFL analysis"
ON ai_afl_analysis
FOR SELECT
USING (
  is_premium = false
);

CREATE POLICY "Premium users can view premium AFL analysis"
ON ai_afl_analysis
FOR SELECT
USING (
  is_premium = true 
  AND (
    public.has_role(auth.uid(), 'premium'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- For ai_nba_analysis
CREATE POLICY "Users can view free NBA analysis"
ON ai_nba_analysis
FOR SELECT
USING (
  is_premium = false
);

CREATE POLICY "Premium users can view premium NBA analysis"
ON ai_nba_analysis
FOR SELECT
USING (
  is_premium = true 
  AND (
    public.has_role(auth.uid(), 'premium'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- For ai_epl_analysis
CREATE POLICY "Users can view free EPL analysis"
ON ai_epl_analysis
FOR SELECT
USING (
  is_premium = false
);

CREATE POLICY "Premium users can view premium EPL analysis"
ON ai_epl_analysis
FOR SELECT
USING (
  is_premium = true 
  AND (
    public.has_role(auth.uid(), 'premium'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);