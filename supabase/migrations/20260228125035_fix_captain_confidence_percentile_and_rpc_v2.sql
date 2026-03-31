/*
  # Fix Captain Confidence: Percentile-Based Calculation + Rebuild RPC v2

  ## Problem
  - captain_confidence was clamped to 100 using LEAST(100, captain_score)
  - This caused most players to show 100% confidence

  ## Fix
  - Use percent_rank() OVER (ORDER BY captain_score) for realistic spread
  - Cast to numeric before ROUND to avoid type mismatch
  - Top captain shows ~100%, 5th shows ~80%, giving meaningful differentiation

  ## Changes
  1. Rebuild v_captain_recommendations with percentile-based captain_confidence
  2. Rebuild get_captain_recommendations_free() to include captain_confidence
*/

-- ─── Rebuild view ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_captain_recommendations;

CREATE VIEW public.v_captain_recommendations AS
WITH ranked AS (
  SELECT
    player_id,
    player_name,
    team,
    projection_final,
    ceiling_estimate,
    consistency_score,
    captain_score,
    captain_rating,
    ROUND(
      (percent_rank() OVER (ORDER BY captain_score) * 100)::numeric
    , 0) AS captain_confidence
  FROM public.v_rankings_master
  WHERE captain_score IS NOT NULL
)
SELECT *
FROM ranked
ORDER BY captain_score DESC
LIMIT 5;

-- ─── Rebuild RPC ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_captain_recommendations_free();

CREATE FUNCTION public.get_captain_recommendations_free()
RETURNS TABLE (
  player_id         bigint,
  player_name       text,
  team              text,
  projection_final  numeric,
  ceiling_estimate  numeric,
  consistency_score numeric,
  captain_score     numeric,
  captain_rating    text,
  captain_confidence numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT *
  FROM public.v_captain_recommendations
  ORDER BY captain_score DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_captain_recommendations_free()
  TO anon, authenticated;
