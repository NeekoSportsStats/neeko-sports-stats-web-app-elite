/*
  # Insert AFL Player Prices from Staging into Canonical Table

  Reads from afl_player_prices_import, cleans the price column:
    - Removes "$" and "," characters
    - Converts to integer
    - Skips rows where the result is not a valid integer

  Joins against v_rankings_master on player_name (case-insensitive) to resolve player_id.
  Inserts season = 2026, round_number = 0.
  Uses ON CONFLICT DO NOTHING to prevent duplicates.
*/

INSERT INTO afl_player_prices (player_id, player_name, position, price, avg_2025, games_2025, priced_at, season, round_number)
SELECT
  r.player_id,
  i.player_name,
  i.position,
  CAST(REPLACE(REPLACE(i.price_raw, '$', ''), ',', '') AS integer) AS price,
  i.avg_2025,
  i.games_2025,
  i.priced_at,
  2026,
  0
FROM afl_player_prices_import i
LEFT JOIN (
  SELECT DISTINCT ON (lower(player_name)) player_id, player_name
  FROM v_rankings_master
  WHERE player_id IS NOT NULL
  ORDER BY lower(player_name), player_id
) r ON lower(r.player_name) = lower(i.player_name)
WHERE
  i.price_raw IS NOT NULL
  AND i.price_raw ~ '^\$[\d,]+$'
ON CONFLICT (player_name, season, round_number) DO NOTHING;
