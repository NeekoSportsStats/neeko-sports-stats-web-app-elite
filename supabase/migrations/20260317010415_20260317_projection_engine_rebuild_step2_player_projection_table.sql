
/*
  # Projection Engine Rebuild — Step 2: Rebuild afl.player_projection Table

  ## Summary
  Drops and recreates afl.player_projection with the correct schema aligned to
  the new feature-table architecture. The old table had columns referencing
  the legacy view pipeline. This replaces it with clean, correctly-typed columns.

  ## New Table: afl.player_projection
  ### Columns
  - player_id            — FK to afl.players, PRIMARY KEY
  - projection_final     — numeric, final weighted projection score
  - ceiling              — integer, 85th percentile ceiling estimate
  - floor                — numeric, 15th percentile floor estimate
  - form_rating          — numeric, weighted form score (0.5*last5 + 0.3*last10 + 0.2*season)
  - matchup_rating       — numeric, from feature_matchup
  - venue_rating         — numeric, from feature_venue (venue_multiplier)
  - rest_rating          — numeric, from feature_rest (rest_days normalised)
  - consistency_score    — numeric, CV-based consistency 0–100
  - risk_rating          — text, risk tier label
  - projection_confidence — numeric, 0–100 confidence score
  - generated_at         — timestamptz, when this row was last computed

  ## Security
  - RLS enabled; existing service_role policies retained
  - Read access for authenticated users (own row not applicable — this is a shared analytics table)
*/

DROP TABLE IF EXISTS afl.player_projection CASCADE;

CREATE TABLE afl.player_projection (
  player_id             integer PRIMARY KEY REFERENCES afl.players(player_id),
  projection_final      numeric,
  ceiling               integer,
  floor                 numeric,
  form_rating           numeric,
  matchup_rating        numeric,
  venue_rating          numeric,
  rest_rating           numeric,
  consistency_score     numeric,
  risk_rating           text,
  projection_confidence numeric,
  generated_at          timestamptz DEFAULT now()
);

ALTER TABLE afl.player_projection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read player projections"
  ON afl.player_projection
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can write player projections"
  ON afl.player_projection
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
