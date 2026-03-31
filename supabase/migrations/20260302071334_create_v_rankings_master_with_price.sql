/*
  # Create v_rankings_master_with_price View

  Extends v_rankings_master with fantasy price data from afl_player_prices.

  1. Source
    - All columns from v_rankings_master
    - price (integer) joined from afl_player_prices

  2. Join Rule
    - LEFT JOIN on player_id
    - season = 2026, round_number = 0

  3. Notes
    - Read-only view, no tables modified
    - Players without a price entry will have price = NULL
*/

CREATE OR REPLACE VIEW public.v_rankings_master_with_price AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.ai_recommendation,
  r.ai_analysis,
  r.recommendation_why,
  r.recommendation_color,
  r.captain_score,
  r.captain_rating,
  p.price
FROM public.v_rankings_master r
LEFT JOIN public.afl_player_prices p
  ON p.player_id = r.player_id
  AND p.season = 2026
  AND p.round_number = 0;

GRANT SELECT ON public.v_rankings_master_with_price TO authenticated;
GRANT SELECT ON public.v_rankings_master_with_price TO anon;
