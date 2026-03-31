/*
  # Step 2 — Unify Price Tables (v2)

  ## Fix
  - Redirect afl.v_player_value_engine to read from public.afl_player_prices
  - Sync afl.player_prices from canonical public table (skip null player_ids)
*/

CREATE OR REPLACE VIEW afl.v_player_value_engine AS
SELECT
  nr.player_id,
  nr.player_name,
  nr.team_id,
  nr.team_name,
  nr.position_group,
  nr.game_id,
  nr.game_date,
  nr.venue,
  nr.opponent_team_id,
  nr.is_home,
  nr.games_played,
  nr.season_avg,
  nr.last3_avg,
  nr.last5_avg,
  nr.last10_avg,
  nr.ceiling,
  nr.floor,
  nr.volatility,
  nr.consistency,
  nr.form_score,
  nr.rest_days,
  nr.projection,
  COALESCE(pp.price, 0) AS price,
  CASE
    WHEN COALESCE(pp.price, 0) = 0 THEN 0
    ELSE ROUND((nr.projection / (pp.price::numeric / 100000.0)) * 10, 2)
  END AS value_score
FROM afl.v_neeko_rating nr
LEFT JOIN (
  SELECT DISTINCT ON (player_id)
    player_id,
    price
  FROM public.afl_player_prices
  WHERE season = 2026
    AND player_id IS NOT NULL
  ORDER BY player_id, created_at DESC NULLS LAST
) pp ON pp.player_id = nr.player_id;

-- Sync afl.player_prices from canonical public table (skip nulls)
INSERT INTO afl.player_prices (player_id, price, updated_at)
SELECT
  player_id::integer,
  price,
  COALESCE(created_at::timestamp, now())
FROM (
  SELECT DISTINCT ON (player_id)
    player_id,
    price,
    created_at
  FROM public.afl_player_prices
  WHERE season = 2026
    AND player_id IS NOT NULL
  ORDER BY player_id, created_at DESC NULLS LAST
) latest
ON CONFLICT (player_id) DO UPDATE
  SET price      = EXCLUDED.price,
      updated_at = EXCLUDED.updated_at;
