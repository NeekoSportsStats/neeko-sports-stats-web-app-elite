-- Drop the old ai_insights table that has public access to premium data
-- The new secure tables (ai_insights_public and ai_insights_premium) are already in place
DROP TABLE IF EXISTS public.ai_insights CASCADE;

-- Also drop the old afl_ai_insights_cache table as it's replaced by ai_insights_public
DROP TABLE IF EXISTS public.afl_ai_insights_cache CASCADE;