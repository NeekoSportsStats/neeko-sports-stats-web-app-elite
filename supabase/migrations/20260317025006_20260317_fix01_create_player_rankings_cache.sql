/*
  # Fix 01: Create afl.player_rankings_cache

  ## Problem
  afl.player_rankings_cache table does not exist. Multiple migrations assumed it
  existed and tried to ALTER it, but the original CREATE was never run.
  This causes:
  - afl.populate_rankings_cache_from_source() to fail (TRUNCATE on non-existent table)
  - v_rankings_master to have no cache backing
  - Market Watch snapshot function to fail (reads from player_rankings_cache)
  - The entire rankings pipeline to be broken

  ## Solution
  Create the full table schema with all columns as expected by populate_rankings_cache_from_source().

  ## New Table
  - afl.player_rankings_cache: Full player rankings cache, rebuilt on every pipeline run
    - All projection, form, AI, value, captain, and meta columns
    - Unique index on player_id for fast lookups
    - Composite indexes for common sort/filter patterns

  ## Security
  - Enable RLS
  - SELECT for anon and authenticated (public read — data is non-sensitive)
*/

CREATE TABLE IF NOT EXISTS afl.player_rankings_cache (
  player_id             integer        NOT NULL,
  player_name           text,
  team                  text,
  team_name             text,
  position              text,
  position_group        text,
  projection_final      numeric,
  projection            double precision,
  ceiling               double precision,
  floor                 double precision,
  ceiling_estimate      double precision GENERATED ALWAYS AS (ceiling) STORED,
  floor_estimate        double precision GENERATED ALWAYS AS (floor) STORED,
  consistency           double precision,
  form_score            double precision,
  neeko_rating          double precision,
  price                 integer,
  value_score           double precision,
  value_tag             text,
  value_tier            text,
  signal                text,
  summary               text,
  analysis              text,
  projection_confidence double precision,
  risk_rating           double precision,
  matchup_rating        text,
  upside_rating         double precision,
  captain_score         double precision,
  captain_rating        text,
  ai_recommendation     text,
  recommendation_color  text,
  recommendation_short  text,
  recommendation_why    text,
  ai_summary            text,
  ai_updated_at         timestamptz,
  consistency_tier      text,
  total_count           integer        DEFAULT 0,
  cached_at             timestamptz    DEFAULT now(),
  created_at            timestamptz    DEFAULT now(),
  CONSTRAINT player_rankings_cache_pkey PRIMARY KEY (player_id)
);

ALTER TABLE afl.player_rankings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read on rankings cache"
  ON afl.player_rankings_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full access on rankings cache"
  ON afl.player_rankings_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rankings_cache_pos_rating
  ON afl.player_rankings_cache (position, neeko_rating DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_rankings_cache_projection
  ON afl.player_rankings_cache (projection_final DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_rankings_cache_value
  ON afl.player_rankings_cache (value_score DESC NULLS LAST);

GRANT SELECT ON afl.player_rankings_cache TO anon, authenticated;

COMMENT ON TABLE afl.player_rankings_cache IS
  'Full player rankings cache. Rebuilt by afl.populate_rankings_cache_from_source() on each pipeline run. Serves both free and premium rankings pages.';
