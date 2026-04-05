/*
  # Scoring System Rebuild — Step 1: Add canonical columns to player_rankings_cache

  Adds the following columns if they don't already exist:
  - breakeven_canonical  : COALESCE(last5_avg, last3_avg, season_avg, projection_final)
  - edge_canonical       : projection_final - breakeven_canonical
  - value_score_canonical: edge_canonical / (price / 100000)
  - signal_canonical     : percentile-based 5-tier classification
  - category_canonical   : Target / Watch / Avoid (pure derivation from signal_canonical)
  - action_canonical     : BUY / HOLD / SELL (pure derivation from signal_canonical)

  These are the ONLY columns the frontend and views should read for classification.
  Legacy columns (market_watch_category, signal_tag, value_gap etc.) remain but are
  no longer the source of truth for classification.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'breakeven_canonical'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN breakeven_canonical numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'edge_canonical'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN edge_canonical numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'value_score_canonical'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN value_score_canonical numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'signal_canonical'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN signal_canonical text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'category_canonical'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN category_canonical text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'action_canonical'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN action_canonical text;
  END IF;
END $$;
