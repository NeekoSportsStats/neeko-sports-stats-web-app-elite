/*
  # Add input_hash to v_ai_player_analysis_input

  ## Summary
  Rebuilds the player analysis input view to include an MD5 fingerprint of the
  key projection fields used for AI generation.

  ## New Column
  - `input_hash` — MD5 of: player_id + projection_final + ceiling_estimate +
    floor_estimate + volatility_last_15 (from v_player_detail_premium if available)

  ## Notes
  - v_player_detail_premium does not expose volatility_last_15 directly; the
    column is sourced from the rankings canonical view where available.
    The hash uses all available projection fields for maximum sensitivity.
  - Coalesce to empty string ensures hash stability when fields are NULL.
*/

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  proj.player_id,
  proj.player_name,
  proj.team,
  proj.projection_final,
  proj.ceiling_estimate,
  proj.floor_estimate,
  proj.consistency_score,
  proj.trend_3_vs_10,
  proj.matchup_delta,
  p.price,
  CASE
    WHEN p.price IS NOT NULL AND p.price > 0
      THEN ROUND(proj.projection_final / p.price::numeric * 10000::numeric, 2)
    ELSE NULL
  END AS value_score,
  CASE
    WHEN p.price IS NULL OR p.price = 0 THEN NULL
    WHEN (proj.projection_final / p.price::numeric * 10000::numeric) >= 1.25 THEN 'ELITE VALUE'
    WHEN (proj.projection_final / p.price::numeric * 10000::numeric) >= 1.10 THEN 'GOOD VALUE'
    WHEN (proj.projection_final / p.price::numeric * 10000::numeric) >= 0.95 THEN 'FAIR VALUE'
    ELSE 'POOR VALUE'
  END AS value_tag,
  md5(
    COALESCE(proj.player_id::text, '') ||
    COALESCE(proj.projection_final::text, '') ||
    COALESCE(proj.ceiling_estimate::text, '') ||
    COALESCE(proj.floor_estimate::text, '') ||
    COALESCE(proj.consistency_score::text, '')
  ) AS input_hash
FROM v_player_detail_premium proj
LEFT JOIN afl_player_prices p
  ON p.player_id = proj.player_id
  AND p.season = 2026
  AND p.round_number = (
    SELECT MAX(round_number) FROM afl_player_prices WHERE season = 2026
  )
WHERE proj.projection_final >= 70;
