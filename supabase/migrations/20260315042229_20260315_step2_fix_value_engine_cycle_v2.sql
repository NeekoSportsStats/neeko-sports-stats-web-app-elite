/*
  # Step 2 Fix v2 — Restore v_player_value_engine Without Cycle

  ## Problem
  Step 2 introduced an infinite recursion:
    v_neeko_rating -> v_player_value_engine -> v_neeko_rating

  ## Root Cause
  Original chain:
    v_projection_engine -> v_player_value_engine -> v_neeko_rating

  v_player_value_engine reads projection stats from v_projection_engine
  (which has game_id, ceiling, floor, consistency, etc.)
  and joins afl.player_prices for price/value_score.

  The Step 2 migration incorrectly set the base to v_neeko_rating.

  ## Fix
  Restore base to afl.v_projection_engine.
  Change only the price lookup: afl.player_prices -> public.afl_player_prices.
  No formula changes. No cycle.
*/

CREATE OR REPLACE VIEW afl.v_player_value_engine AS
SELECT
  pe.player_id,
  pe.player_name,
  pe.team_id,
  pe.team_name,
  pe.position_group,
  pe.game_id,
  pe.game_date,
  pe.venue,
  pe.opponent_team_id,
  pe.is_home,
  pe.games_played,
  pe.season_avg,
  pe.last3_avg,
  pe.last5_avg,
  pe.last10_avg,
  pe.ceiling,
  pe.floor,
  pe.volatility,
  pe.consistency,
  pe.form_score,
  pe.rest_days,
  pe.projection,
  COALESCE(pp.price, 0) AS price,
  CASE
    WHEN COALESCE(pp.price, 0) = 0 THEN 0
    ELSE ROUND((pe.projection / (pp.price::numeric / 100000.0)) * 10, 2)
  END AS value_score
FROM afl.v_projection_engine pe
LEFT JOIN (
  SELECT DISTINCT ON (player_id)
    player_id,
    price
  FROM public.afl_player_prices
  WHERE season = 2026
    AND player_id IS NOT NULL
  ORDER BY player_id, created_at DESC NULLS LAST
) pp ON pp.player_id = pe.player_id;
