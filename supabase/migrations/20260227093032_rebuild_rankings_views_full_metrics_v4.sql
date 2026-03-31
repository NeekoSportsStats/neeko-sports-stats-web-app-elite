/*
  # Rebuild v_rankings_premium and v_rankings_free with full metric columns (v4)

  ## Summary
  Rebuilds all three interdependent public ranking views with full metric columns.

  ## Type Fix
  players_canonical.canonical_player_id is text; v_player_detail_premium.player_id is bigint.
  Join uses explicit cast: pc.canonical_player_id = proj.player_id::text

  ## Circular Dependency Resolution
  v_captain_recommendations previously read from v_rankings_premium and exposed
  trend_3_vs_10 / matchup_delta which no longer pass through the premium view.
  The captain view is rebuilt to use only the columns v_rankings_premium exposes.

  ## Data Sources
  - public.v_player_detail_premium: core projection and raw form/matchup metrics
  - afl.players_canonical: position (season = 2026)

  ## Computed Columns added to v_rankings_premium
  - form_rating, matchup_rating, upside_rating, risk_rating
  - projection_confidence, ai_recommendation
  - captain_score, captain_rating (computed inline to avoid circular join)

  ## Rebuild Order
  1. DROP v_rankings_free, v_captain_recommendations, v_rankings_premium (CASCADE)
  2. CREATE v_rankings_premium
  3. CREATE v_captain_recommendations (reads from v_rankings_premium)
  4. CREATE v_rankings_free (reads from v_rankings_premium)
*/

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;
DROP VIEW IF EXISTS public.v_captain_recommendations CASCADE;
DROP VIEW IF EXISTS public.v_rankings_premium CASCADE;

CREATE VIEW public.v_rankings_premium AS
SELECT
  proj.player_id,
  proj.player_name,
  proj.team,
  pc.position,
  proj.projection_final,
  proj.ceiling_estimate,
  proj.floor_estimate,
  proj.consistency_score,

  CASE
    WHEN proj.trend_3_vs_10 >= 15  THEN 90
    WHEN proj.trend_3_vs_10 >= 8   THEN 80
    WHEN proj.trend_3_vs_10 >= 3   THEN 70
    WHEN proj.trend_3_vs_10 >= -3  THEN 60
    WHEN proj.trend_3_vs_10 >= -10 THEN 45
    ELSE 30
  END::numeric AS form_rating,

  CASE
    WHEN proj.matchup_delta >= 10 THEN 90
    WHEN proj.matchup_delta >= 5  THEN 80
    WHEN proj.matchup_delta >= 0  THEN 65
    WHEN proj.matchup_delta >= -5 THEN 50
    ELSE 35
  END::numeric AS matchup_rating,

  CASE
    WHEN proj.projection_final > 0
      THEN ROUND(((proj.ceiling_estimate - proj.projection_final) / proj.projection_final) * 100)
    ELSE NULL
  END AS upside_rating,

  CASE
    WHEN proj.projection_final > 0
      THEN ROUND(((proj.projection_final - proj.floor_estimate) / proj.projection_final) * 100)
    ELSE NULL
  END AS risk_rating,

  ROUND(proj.consistency_score) AS projection_confidence,

  NULL::text AS ai_recommendation,

  ROUND(
    COALESCE(proj.projection_final, 0) * 0.45
    + COALESCE(proj.ceiling_estimate, 0) * 0.25
    + COALESCE(proj.consistency_score, 0)::numeric * 0.20
    + GREATEST(COALESCE(proj.matchup_delta, 0), 0) * 1.5
    + GREATEST(COALESCE(proj.trend_3_vs_10, 0), 0) * 0.8,
    1
  ) AS captain_score,

  CASE
    WHEN proj.projection_final >= 115 AND proj.consistency_score >= 70 THEN 'Elite Captain'
    WHEN proj.projection_final >= 105 AND proj.consistency_score >= 60 THEN 'Strong Captain'
    WHEN proj.projection_final >= 95  THEN 'Captain Option'
    ELSE 'Risky Captain'
  END AS captain_rating

FROM public.v_player_detail_premium proj
LEFT JOIN afl.players_canonical pc
  ON pc.canonical_player_id = proj.player_id::text
  AND pc.season = 2026;


CREATE VIEW public.v_captain_recommendations AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating
FROM public.v_rankings_premium
ORDER BY captain_score DESC;


CREATE VIEW public.v_rankings_free AS
SELECT *
FROM public.v_rankings_premium
ORDER BY projection_final DESC NULLS LAST
LIMIT 20;
