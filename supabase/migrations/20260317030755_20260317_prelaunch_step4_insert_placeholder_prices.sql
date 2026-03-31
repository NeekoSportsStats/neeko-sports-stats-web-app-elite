/*
  # Pre-Launch Step 4: Insert Placeholder Prices for Unpriced Players

  ## Summary
  70 players in afl.mv_player_projection have no entry in afl.player_prices.
  Without a price they are excluded from Market Watch (WHERE price > 0 filter)
  and show null price in the Rankings page.

  Inserts a placeholder price of 250000 for all players currently missing a price.
  Uses ON CONFLICT DO NOTHING to be safe — will not overwrite any existing prices.

  ## Table Modified
  - afl.player_prices: INSERT for ~70 unpriced players

  ## Notes
  - These prices should be replaced with real opening round prices before launch
  - 250000 is the AFL Fantasy minimum starting price for unpriced/rookie players
*/

INSERT INTO afl.player_prices (player_id, price, updated_at)
SELECT
  p.player_id,
  250000,
  now()
FROM afl.mv_player_projection p
WHERE p.player_id NOT IN (
  SELECT player_id FROM afl.player_prices WHERE price IS NOT NULL
)
ON CONFLICT DO NOTHING;

-- Update player_rankings_cache with the new prices for these players
UPDATE afl.player_rankings_cache c
SET
  price      = 250000,
  value_tag  = CASE
                 WHEN c.value_score >= 500 THEN 'Elite Value'
                 WHEN c.value_score >= 300 THEN 'Good Value'
                 WHEN c.value_score >= 150 THEN 'Fair Value'
                 WHEN c.value_score >= 50  THEN 'Slight Value'
                 ELSE 'Overpriced'
               END,
  cached_at  = now()
WHERE c.price IS NULL OR c.price = 0;
