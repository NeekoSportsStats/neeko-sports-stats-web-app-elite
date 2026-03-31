/*
  # Rebuild Rankings Views with Premium Decision Columns

  ## Summary
  Drops and recreates both v_rankings_premium and v_rankings_free to:
  1. Remove the stale `position` column reference (column no longer exists in source)
  2. Add six new computed decision-making columns to the premium view
  3. Keep the free view returning only the top 20 rows with premium columns as NULL

  ## New Columns in v_rankings_premium
  - `form_rating`           – Text label derived from trend_3_vs_10
  - `matchup_rating`        – Text label derived from matchup_delta
  - `upside_rating`         – Text label derived from (ceiling_estimate - projection_final)
  - `risk_rating`           – Text label derived from consistency_score
  - `projection_confidence` – Integer 0-100 blending consistency + trend stability
  - `ai_recommendation`     – Decision label combining all key signals

  ## v_rankings_free
  Returns top 20 rows; new premium columns are returned as NULL for free users.

  ## Data Safety
  - No tables are dropped or modified
  - DROP CASCADE only removes the dependent view (v_rankings_free), which is immediately recreated
*/

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;
DROP VIEW IF EXISTS public.v_rankings_premium CASCADE;

CREATE VIEW public.v_rankings_premium AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  trend_3_vs_10,
  matchup_delta,
  consistency_score,
  TRUE AS is_premium_unlocked,

  CASE
    WHEN trend_3_vs_10 >= 15  THEN 'Elite Form'
    WHEN trend_3_vs_10 >= 8   THEN 'Rising'
    WHEN trend_3_vs_10 >= -5  THEN 'Neutral'
    WHEN trend_3_vs_10 >= -12 THEN 'Falling'
    ELSE 'Cold'
  END AS form_rating,

  CASE
    WHEN matchup_delta >= 10  THEN 'Very Easy'
    WHEN matchup_delta >= 5   THEN 'Easy'
    WHEN matchup_delta >= -5  THEN 'Neutral'
    WHEN matchup_delta >= -10 THEN 'Hard'
    ELSE 'Very Hard'
  END AS matchup_rating,

  CASE
    WHEN (ceiling_estimate - projection_final) >= 30 THEN 'Massive Upside'
    WHEN (ceiling_estimate - projection_final) >= 20 THEN 'High Upside'
    WHEN (ceiling_estimate - projection_final) >= 12 THEN 'Moderate Upside'
    ELSE 'Limited Upside'
  END AS upside_rating,

  CASE
    WHEN consistency_score >= 75 THEN 'Very Safe'
    WHEN consistency_score >= 60 THEN 'Safe'
    WHEN consistency_score >= 40 THEN 'Risky'
    ELSE 'High Risk'
  END AS risk_rating,

  ROUND(
    COALESCE(consistency_score, 0) * 0.7
    + (100 - ABS(COALESCE(trend_3_vs_10, 0))) * 0.3
  )::integer AS projection_confidence,

  CASE
    WHEN projection_final >= 110
      AND consistency_score >= 65
      AND matchup_delta >= 0
    THEN 'Must Have'

    WHEN trend_3_vs_10 >= 15
      AND matchup_delta >= 0
    THEN 'Breakout Candidate'

    WHEN consistency_score >= 75
      AND projection_final >= 100
    THEN 'Safe Pick'

    WHEN matchup_delta <= -10
      AND consistency_score <= 40
    THEN 'Avoid'

    ELSE 'Solid Pick'
  END AS ai_recommendation

FROM afl.v_neeko_player_projection_final
ORDER BY projection_final DESC;


CREATE VIEW public.v_rankings_free AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  NULL::numeric  AS ceiling_estimate,
  NULL::numeric  AS floor_estimate,
  NULL::numeric  AS trend_3_vs_10,
  NULL::numeric  AS matchup_delta,
  NULL::numeric  AS consistency_score,
  FALSE          AS is_premium_unlocked,
  NULL::text     AS form_rating,
  NULL::text     AS matchup_rating,
  NULL::text     AS upside_rating,
  NULL::text     AS risk_rating,
  NULL::integer  AS projection_confidence,
  NULL::text     AS ai_recommendation
FROM afl.v_neeko_player_projection_final
ORDER BY projection_final DESC
LIMIT 20;
