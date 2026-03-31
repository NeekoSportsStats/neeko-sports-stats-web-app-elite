
/*
  # Create afl.player_projection_confidence table

  ## Summary
  Introduces a dedicated confidence scoring table that measures how
  statistically stable each player's output is, separate from the raw
  projection value.

  ## New Table: afl.player_projection_confidence
  - player_id            — FK to afl.players
  - games_sample         — number of scored games used in calculation
  - stddev_last10        — standard deviation of fantasy score over last 10 games
  - stddev_last5         — standard deviation of fantasy score over last 5 games
  - consistency_index    — 100 - (stddev_last10 * 1.5), clamped 30–95
  - form_stability       — 100 - ABS(last3_avg - season_avg), clamped 40–95
  - confidence_score     — 0.6 * consistency_index + 0.4 * form_stability
  - confidence_tier      — HIGH (>75) / MEDIUM (55–75) / LOW (<55)
  - updated_at           — last computed

  ## Security
  - RLS enabled; service role has full access
  - Authenticated users can read (needed for frontend/admin views)
*/

CREATE TABLE IF NOT EXISTS afl.player_projection_confidence (
  player_id          integer      NOT NULL,
  games_sample       integer      NOT NULL DEFAULT 0,
  stddev_last10      numeric(8,2),
  stddev_last5       numeric(8,2),
  consistency_index  numeric(6,2) NOT NULL DEFAULT 50,
  form_stability     numeric(6,2) NOT NULL DEFAULT 50,
  confidence_score   numeric(6,2) NOT NULL DEFAULT 50,
  confidence_tier    text         NOT NULL DEFAULT 'MEDIUM',
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT player_projection_confidence_pkey PRIMARY KEY (player_id),
  CONSTRAINT player_projection_confidence_tier_check
    CHECK (confidence_tier IN ('HIGH', 'MEDIUM', 'LOW'))
);

ALTER TABLE afl.player_projection_confidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to player_projection_confidence"
  ON afl.player_projection_confidence
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read player_projection_confidence"
  ON afl.player_projection_confidence
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_player_projection_confidence_tier
  ON afl.player_projection_confidence (confidence_tier);

CREATE INDEX IF NOT EXISTS idx_player_projection_confidence_score
  ON afl.player_projection_confidence (confidence_score DESC);
