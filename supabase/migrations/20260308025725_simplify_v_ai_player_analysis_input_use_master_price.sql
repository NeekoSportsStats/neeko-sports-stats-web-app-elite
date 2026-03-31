/*
  # Simplify v_ai_player_analysis_input — Use v_rankings_master price/value_score

  ## Problem
  The view was doing expensive per-row subqueries for price (up to 5 subqueries
  per row). Now that v_rankings_master directly includes price and value_score
  via a clean LEFT JOIN, this view can simply reference those columns.

  ## Changes
  - Removed 5 correlated subqueries per player
  - Source price directly from r.price (v_rankings_master)
  - Source value_score directly from r.value_score (v_rankings_master)
  - Simplified value_tag to use r.value_score directly
  - input_hash simplified to use r.price from the master view
  - No WHERE filter — all 596 players remain eligible
*/

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  (r.ceiling_estimate - r.floor_estimate)   AS trend_3_vs_10,
  (r.matchup_rating - 65)                   AS matchup_delta,
  r.price,
  r.value_score,
  CASE
    WHEN r.value_score IS NULL              THEN NULL
    WHEN r.value_score >= 1.25              THEN 'ELITE VALUE'
    WHEN r.value_score >= 1.10              THEN 'GOOD VALUE'
    WHEN r.value_score >= 0.95              THEN 'FAIR VALUE'
    ELSE                                         'POOR VALUE'
  END AS value_tag,
  md5(
    concat_ws('|',
      COALESCE(r.player_id::text,         ''),
      COALESCE(r.projection_final::text,  ''),
      COALESCE(r.ceiling_estimate::text,  ''),
      COALESCE(r.floor_estimate::text,    ''),
      COALESCE(r.consistency_score::text, ''),
      COALESCE(r.price::text,             '')
    )
  ) AS input_hash
FROM public.v_rankings_master r;
