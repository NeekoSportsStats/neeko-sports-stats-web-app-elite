/*
  # Fix: Expand v_ai_player_analysis_input to Full 596 Player Coverage

  ## Problem
  Current view sources from v_player_detail_premium and filters WHERE
  projection_final >= 70, limiting AI input to ~188 players out of 596.

  ## Fix
  Rebuild to source from v_rankings_master (full 596 player roster) with no
  projection threshold. Price join updated to use correct schema (public.afl_player_prices).

  ## Changes
  - Source changed: v_player_detail_premium → v_rankings_master
  - Removed: WHERE projection_final >= 70 filter
  - Retained: price LEFT JOIN from public.afl_player_prices
  - Retained: value_score, value_tag, input_hash calculations
  - trend_3_vs_10 derived from ceiling_estimate - floor_estimate (spread proxy)
  - matchup_delta derived from matchup_rating - 65 (baseline offset)
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
  (r.ceiling_estimate - r.floor_estimate)                                   AS trend_3_vs_10,
  (r.matchup_rating - 65)                                                    AS matchup_delta,
  p.price,
  CASE
    WHEN p.price IS NOT NULL AND p.price > 0
    THEN round(r.projection_final / p.price::numeric * 10000::numeric, 2)
    ELSE NULL::numeric
  END AS value_score,
  CASE
    WHEN p.price IS NULL OR p.price = 0 THEN NULL::text
    WHEN (r.projection_final / p.price::numeric * 10000::numeric) >= 1.25 THEN 'ELITE VALUE'
    WHEN (r.projection_final / p.price::numeric * 10000::numeric) >= 1.10 THEN 'GOOD VALUE'
    WHEN (r.projection_final / p.price::numeric * 10000::numeric) >= 0.95 THEN 'FAIR VALUE'
    ELSE 'POOR VALUE'
  END AS value_tag,
  md5(
    concat_ws('|',
      COALESCE(r.player_id::text, ''),
      COALESCE(r.projection_final::text, ''),
      COALESCE(r.ceiling_estimate::text, ''),
      COALESCE(r.floor_estimate::text, ''),
      COALESCE(r.consistency_score::text, ''),
      COALESCE(p.price::text, '')
    )
  ) AS input_hash
FROM public.v_rankings_master r
LEFT JOIN public.afl_player_prices p
  ON  p.player_id    = r.player_id
  AND p.season       = 2026
  AND p.round_number = (
    SELECT MAX(round_number) FROM public.afl_player_prices WHERE season = 2026
  );
