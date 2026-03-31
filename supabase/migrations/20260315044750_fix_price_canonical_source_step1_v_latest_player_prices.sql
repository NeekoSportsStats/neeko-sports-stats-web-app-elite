/*
  # Fix Price Canonical Source — Step 1: Create afl.v_latest_player_prices

  ## Summary
  Creates a clean canonical price view that reads exclusively from `afl.player_prices`,
  which is the table with correct player_id alignment to `afl.players` (88.3% coverage
  vs 8.4% from the misaligned `public.afl_player_prices`).

  ## Why
  The previous pipeline joined `public.afl_player_prices` in `afl.v_player_value_engine`.
  That table's player_id values do not match `afl.players`, resulting in only 62 of 736
  players receiving a price (8.4%). `afl.player_prices` matches 650 of 736 players (88.3%).

  ## New View
  - `afl.v_latest_player_prices`: one row per player_id, price from `afl.player_prices`

  ## No existing data is modified. This is a new view only.
*/

CREATE OR REPLACE VIEW afl.v_latest_player_prices AS
SELECT
  player_id,
  price,
  updated_at
FROM afl.player_prices
WHERE player_id IS NOT NULL
  AND price IS NOT NULL
  AND price > 0;

GRANT SELECT ON afl.v_latest_player_prices TO authenticated;
GRANT SELECT ON afl.v_latest_player_prices TO anon;
