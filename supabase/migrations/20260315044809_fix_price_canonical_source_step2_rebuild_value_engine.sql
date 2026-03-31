/*
  # Fix Price Canonical Source — Step 2: Rebuild afl.v_player_value_engine

  ## Summary
  Rebuilds `afl.v_player_value_engine` to join against `afl.v_latest_player_prices`
  instead of the misaligned `public.afl_player_prices`.

  ## Changes
  - Price join now uses `afl.v_latest_player_prices` (correct player_id namespace)
  - All other columns and logic are identical to the previous version
  - value_score formula is unchanged

  ## Expected Impact
  Price coverage in rankings increases from 8.4% (62/736) to ~88.3% (650/736).
  Market Watch will have significantly more players categorised.
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
    WHEN COALESCE(pp.price, 0) = 0 THEN 0::numeric
    ELSE ROUND((pe.projection / (pp.price::numeric / 100000.0)) * 10::numeric, 2)
  END AS value_score
FROM afl.v_projection_engine pe
LEFT JOIN afl.v_latest_player_prices pp ON pp.player_id = pe.player_id;
