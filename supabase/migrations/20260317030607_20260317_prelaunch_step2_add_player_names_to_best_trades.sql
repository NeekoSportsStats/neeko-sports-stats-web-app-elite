/*
  # Pre-Launch Step 2: Add Player Name Columns to market.market_watch_best_trades

  ## Summary
  The frontend MWBestTrade interface expects out_player_name and in_player_name
  but the table only stores player IDs. Adding both text columns so the snapshot
  function can populate them directly, avoiding the need for a JOIN in every query.

  ## Table Modified
  - market.market_watch_best_trades
    - ADD COLUMN out_player_name text
    - ADD COLUMN in_player_name text
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'market'
      AND table_name = 'market_watch_best_trades'
      AND column_name = 'out_player_name'
  ) THEN
    ALTER TABLE market.market_watch_best_trades ADD COLUMN out_player_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'market'
      AND table_name = 'market_watch_best_trades'
      AND column_name = 'in_player_name'
  ) THEN
    ALTER TABLE market.market_watch_best_trades ADD COLUMN in_player_name text;
  END IF;
END $$;
