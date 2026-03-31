/*
  # Drop stale no-arg function overloads

  ## Background
  Several functions have stale no-argument overloads that were superseded
  by parameterised versions. These create ambiguity in PostgreSQL's function
  resolution and may be called unintentionally.

  ## Changes

  1. `enqueue_ranking_reco_jobs()` no-arg overload — superseded by
     `enqueue_ranking_reco_jobs(p_force boolean DEFAULT false)`

  2. `get_latest_completed_round()` no-arg overload — superseded by
     `get_latest_completed_round(p_season integer DEFAULT 2026)`

  Both are dropped with IF EXISTS to be safe.
*/

-- Drop the no-arg enqueue_ranking_reco_jobs overload
-- The active version takes (p_force boolean DEFAULT false)
DROP FUNCTION IF EXISTS public.enqueue_ranking_reco_jobs();

-- Drop the no-arg get_latest_completed_round overload
-- The active version takes (p_season integer DEFAULT 2026)
DROP FUNCTION IF EXISTS public.get_latest_completed_round();
