/*
  # NEEKO SPORTS — FULL SYSTEM UNIFICATION: Step 1
  Add derived decision columns to player_rankings_cache

  ## Summary
  Adds three derived decision columns to afl.player_rankings_cache so that Rankings
  becomes the single source of truth for all downstream decision systems (Edge Board,
  Start/Sit, Market Watch).

  ## New Columns
  - `start_sit_decision` (text): START / SIT / CONSIDER — replaces edge function logic
  - `edge_score` (integer 0–100): replaces frontend computeEdgeScore()
  - `edge_tier` (text): Elite Edge / Strong Edge / Playable Edge / Monitor
  - `market_watch_category` (text): BUY TARGET / SELL / TRENDING UP / CASH COW / TRAP

  ## Why
  Previously each page computed its own signals from raw fields, leading to contradictions.
  All signals now computed once in the populate function and stored in the cache.
*/

-- Step 1: Add columns if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'start_sit_decision'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN start_sit_decision text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'edge_score'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN edge_score integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'edge_tier'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN edge_tier text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'market_watch_category'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN market_watch_category text;
  END IF;

  -- Also add upside_pct if missing (referenced in views but may not exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'upside_pct'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN upside_pct double precision;
  END IF;

  -- Add recommendation_strength if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'recommendation_strength'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN recommendation_strength text;
  END IF;
END $$;

-- Step 2: Backfill existing rows with derived values from existing cache fields
UPDATE afl.player_rankings_cache SET
  start_sit_decision = CASE
    WHEN ai_recommendation = 'BUY' AND COALESCE(projection_confidence, 0) >= 60 THEN 'START'
    WHEN ai_recommendation = 'SELL' THEN 'SIT'
    ELSE 'CONSIDER'
  END,

  edge_score = CASE
    WHEN (
      CASE WHEN projection_final IS NULL THEN 1 ELSE 0 END +
      CASE WHEN projection_confidence IS NULL THEN 1 ELSE 0 END +
      CASE WHEN risk_rating IS NULL THEN 1 ELSE 0 END +
      CASE WHEN value_score IS NULL THEN 1 ELSE 0 END
    ) >= 2 THEN NULL
    ELSE LEAST(100, GREATEST(0, ROUND((
        LEAST(GREATEST((COALESCE(projection_final, 90) - 60.0) / 60.0, 0), 1) * 0.40 +
        LEAST(GREATEST((COALESCE(value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
        LEAST(GREATEST(COALESCE(projection_confidence, 50) / 100.0, 0), 1) * 0.20 +
        LEAST(GREATEST(1.0 - COALESCE(risk_rating, 50) / 100.0, 0), 1) * 0.15
      ) * 100
    )::integer))
  END,

  edge_tier = CASE
    WHEN (
      CASE WHEN projection_final IS NULL THEN 1 ELSE 0 END +
      CASE WHEN projection_confidence IS NULL THEN 1 ELSE 0 END +
      CASE WHEN risk_rating IS NULL THEN 1 ELSE 0 END +
      CASE WHEN value_score IS NULL THEN 1 ELSE 0 END
    ) >= 2 THEN NULL
    WHEN LEAST(100, GREATEST(0, ROUND((
        LEAST(GREATEST((COALESCE(projection_final, 90) - 60.0) / 60.0, 0), 1) * 0.40 +
        LEAST(GREATEST((COALESCE(value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
        LEAST(GREATEST(COALESCE(projection_confidence, 50) / 100.0, 0), 1) * 0.20 +
        LEAST(GREATEST(1.0 - COALESCE(risk_rating, 50) / 100.0, 0), 1) * 0.15
      ) * 100
    )::integer)) >= 90 THEN 'Elite Edge'
    WHEN LEAST(100, GREATEST(0, ROUND((
        LEAST(GREATEST((COALESCE(projection_final, 90) - 60.0) / 60.0, 0), 1) * 0.40 +
        LEAST(GREATEST((COALESCE(value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
        LEAST(GREATEST(COALESCE(projection_confidence, 50) / 100.0, 0), 1) * 0.20 +
        LEAST(GREATEST(1.0 - COALESCE(risk_rating, 50) / 100.0, 0), 1) * 0.15
      ) * 100
    )::integer)) >= 75 THEN 'Strong Edge'
    WHEN LEAST(100, GREATEST(0, ROUND((
        LEAST(GREATEST((COALESCE(projection_final, 90) - 60.0) / 60.0, 0), 1) * 0.40 +
        LEAST(GREATEST((COALESCE(value_score, 1.0) - 0.8) / 0.7, 0), 1) * 0.25 +
        LEAST(GREATEST(COALESCE(projection_confidence, 50) / 100.0, 0), 1) * 0.20 +
        LEAST(GREATEST(1.0 - COALESCE(risk_rating, 50) / 100.0, 0), 1) * 0.15
      ) * 100
    )::integer)) >= 60 THEN 'Playable Edge'
    ELSE 'Monitor'
  END,

  market_watch_category = CASE
    WHEN ai_recommendation = 'BUY' AND COALESCE(value_score, 0) >= 4.5 THEN 'BUY TARGET'
    WHEN ai_recommendation = 'SELL' AND COALESCE(risk_rating, 50) >= 60 THEN 'TRAP'
    WHEN ai_recommendation = 'SELL' THEN 'SELL'
    WHEN ai_recommendation = 'BUY' AND COALESCE(games_played, 99) <= 3 THEN 'CASH COW'
    WHEN ai_recommendation = 'BUY' AND COALESCE(form_score, 0) >= 70 THEN 'TRENDING UP'
    ELSE NULL
  END,

  recommendation_strength = CASE
    WHEN ai_recommendation = 'BUY' AND COALESCE(projection_confidence, 0) >= 70 THEN 'STRONG'
    WHEN ai_recommendation = 'BUY' THEN 'MODERATE'
    WHEN ai_recommendation = 'SELL' AND COALESCE(risk_rating, 50) >= 65 THEN 'STRONG'
    WHEN ai_recommendation = 'SELL' THEN 'MODERATE'
    ELSE 'WEAK'
  END;
