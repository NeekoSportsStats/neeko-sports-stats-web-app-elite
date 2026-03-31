
/*
  # Create afl.player_breakout_model — Breakout Probability Model

  ## Summary
  Identifies players likely to significantly outperform projections by combining
  recent upward trend with historical ceiling hit rate and volatility signals.

  ## New Table: afl.player_breakout_model
  - player_id               — FK to afl.players
  - games_sample            — number of games used to compute the model
  - recent_trend            — last3_avg minus season_avg (positive = trending up)
  - volatility_score        — from player_variation (0-100, higher = more volatile)
  - ceiling_hit_rate        — % of games where player hit their ceiling (0-100)
  - breakout_index          — composite raw score normalised to 0-100
  - breakout_probability    — breakout_index converted to 0-1 probability
  - breakout_flag           — TRUE when breakout_probability > 0.65
  - updated_at

  ## Formula
  1. recent_trend   = last3_avg - season_avg
  2. upside_signal  = ceiling_hit_rate * volatility_score          (raw product)
  3. raw_score      = recent_trend + (upside_signal * 0.4)
  4. breakout_index = NORMALISE(raw_score) to 0-100 using min-max across all players
  5. breakout_prob  = breakout_index / 100 (linear 0-1)
  6. breakout_flag  = breakout_probability > 0.65

  ## Security
  - RLS enabled
  - service_role: full access
  - authenticated: read-only
*/

CREATE TABLE IF NOT EXISTS afl.player_breakout_model (
  player_id             integer      NOT NULL,
  games_sample          integer      NOT NULL DEFAULT 0,
  recent_trend          numeric(8,2),
  volatility_score      numeric(6,2),
  ceiling_hit_rate      numeric(6,2),
  breakout_index        numeric(6,2),
  breakout_probability  numeric(6,4),
  breakout_flag         boolean      NOT NULL DEFAULT false,
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT player_breakout_model_pkey PRIMARY KEY (player_id)
);

ALTER TABLE afl.player_breakout_model ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_breakout_model"
  ON afl.player_breakout_model
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read player_breakout_model"
  ON afl.player_breakout_model
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_breakout_model_probability
  ON afl.player_breakout_model (breakout_probability DESC);

CREATE INDEX IF NOT EXISTS idx_breakout_model_flag
  ON afl.player_breakout_model (breakout_flag)
  WHERE breakout_flag = true;

-- -----------------------------------------------------------------------
-- Refresh function
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION afl.refresh_player_breakout_model()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO afl.player_breakout_model (
    player_id,
    games_sample,
    recent_trend,
    volatility_score,
    ceiling_hit_rate,
    breakout_index,
    breakout_probability,
    breakout_flag,
    updated_at
  )
  WITH raw_signals AS (
    SELECT
      f.player_id,
      COALESCE(pv.games_used, f.games_played, 0)              AS games_sample,
      -- Step 2: recent trend
      ROUND(
        COALESCE(f.last3_avg, f.season_avg, 0)
        - COALESCE(f.season_avg, 0)
      , 2)                                                     AS recent_trend,
      -- raw inputs for upside
      COALESCE(pv.volatility_score, 0)                        AS volatility_score,
      COALESCE(pv.ceiling_hit_rate, 0)                        AS ceiling_hit_rate
    FROM afl.feature_player_form f
    LEFT JOIN afl.player_variation pv ON pv.player_id = f.player_id
    WHERE COALESCE(f.games_played, 0) >= 3
  ),
  raw_scored AS (
    SELECT
      player_id,
      games_sample,
      recent_trend,
      volatility_score,
      ceiling_hit_rate,
      -- Step 3: upside_signal = ceiling_hit_rate * volatility_score (product of two 0-100 values)
      -- Step 4: raw_score = recent_trend + (upside_signal * 0.4)
      ROUND(
        recent_trend + ((ceiling_hit_rate * volatility_score) * 0.4)
      , 4)                                                     AS raw_score
    FROM raw_signals
  ),
  bounds AS (
    SELECT
      MIN(raw_score) AS min_raw,
      MAX(raw_score) AS max_raw
    FROM raw_scored
  ),
  normalised AS (
    SELECT
      rs.player_id,
      rs.games_sample,
      rs.recent_trend,
      rs.volatility_score,
      rs.ceiling_hit_rate,
      -- Step 4: normalise raw_score to 0-100
      ROUND(
        CASE
          WHEN b.max_raw = b.min_raw THEN 50.0
          ELSE ((rs.raw_score - b.min_raw) / (b.max_raw - b.min_raw)) * 100.0
        END::numeric
      , 2)                                                     AS breakout_index
    FROM raw_scored rs
    CROSS JOIN bounds b
  )
  SELECT
    player_id,
    games_sample,
    recent_trend,
    volatility_score,
    ceiling_hit_rate,
    breakout_index,
    -- Step 5: probability = breakout_index / 100
    ROUND((breakout_index / 100.0)::numeric, 4)                AS breakout_probability,
    -- Step 6: flag if probability > 0.65
    (breakout_index / 100.0) > 0.65                            AS breakout_flag,
    now()
  FROM normalised
  ON CONFLICT (player_id) DO UPDATE SET
    games_sample         = EXCLUDED.games_sample,
    recent_trend         = EXCLUDED.recent_trend,
    volatility_score     = EXCLUDED.volatility_score,
    ceiling_hit_rate     = EXCLUDED.ceiling_hit_rate,
    breakout_index       = EXCLUDED.breakout_index,
    breakout_probability = EXCLUDED.breakout_probability,
    breakout_flag        = EXCLUDED.breakout_flag,
    updated_at           = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Breakout model refreshed for ' || v_count || ' players';
END;
$$;

-- Initial backfill
SELECT afl.refresh_player_breakout_model();
