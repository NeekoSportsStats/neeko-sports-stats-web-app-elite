/*
  # Create v_captain_recommendations View

  ## Summary
  Creates a new public view that ranks players by a composite captain score for
  fantasy decision-making. Built on top of v_rankings_premium — no tables are
  modified or dropped.

  ## New View: public.v_captain_recommendations

  ### Captain Score Formula
  Weights high projection, ceiling upside, consistency, positive matchup, and
  positive trend. Cast to numeric for ROUND compatibility.

  ### Captain Rating Thresholds
  - Elite Captain   : projection >= 115 AND consistency >= 70
  - Strong Captain  : projection >= 105 AND consistency >= 60
  - Captain Option  : projection >= 95
  - Risky Captain   : everything else

  ## Data Safety
  - Read-only view; no tables are modified
*/

CREATE OR REPLACE VIEW public.v_captain_recommendations AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  trend_3_vs_10,
  matchup_delta,

  ROUND(
    (
      COALESCE(projection_final, 0)::numeric  * 0.45
      + COALESCE(ceiling_estimate, 0)::numeric  * 0.25
      + COALESCE(consistency_score, 0)::numeric * 0.20
      + GREATEST(COALESCE(matchup_delta, 0)::numeric, 0)   * 1.5
      + GREATEST(COALESCE(trend_3_vs_10, 0)::numeric, 0)   * 0.8
    )
  , 1) AS captain_score,

  CASE
    WHEN projection_final >= 115 AND consistency_score >= 70
      THEN 'Elite Captain'
    WHEN projection_final >= 105 AND consistency_score >= 60
      THEN 'Strong Captain'
    WHEN projection_final >= 95
      THEN 'Captain Option'
    ELSE
      'Risky Captain'
  END AS captain_rating

FROM public.v_rankings_premium
ORDER BY captain_score DESC;
