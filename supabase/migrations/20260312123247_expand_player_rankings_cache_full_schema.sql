/*
  # Expand afl.player_rankings_cache — Full Column Set

  ## Summary
  The cache table was missing 17 columns needed by the frontend. This migration
  adds all missing columns so the cache can serve as the single source of truth
  for both free and premium users, eliminating the slow v_player_rankings_full
  query path (which caused ~38s load times).

  ## New columns added:
  - team_name          alias for team (frontend normalization reads r.team_name)
  - position_group     alias for position (frontend reads r.position_group)
  - projection         alias for projection_final (frontend reads r.projection)
  - ceiling            numeric ceiling estimate
  - floor              numeric floor estimate
  - consistency        consistency score (0–100)
  - form_score         form rating (0–100)
  - matchup_rating     text label (Favorable/Neutral/Tough)
  - upside_rating      breakout probability clamped 0–100
  - captain_score      numeric captain score
  - ai_summary         long-form AI analysis text
  - ai_updated_at      when AI was last generated
  - recommendation_short  single-sentence AI recommendation
  - recommendation_color  color label for UI badge
  - value_tag          value classification tag
  - value_tier         value tier label
  - consistency_tier   consistency classification
  - total_count        total rows (populated as constant on refresh)

  ## Indexes added:
  - Composite (position, neeko_rating DESC) for fast position-filtered sorts
  - projection_final DESC for projection tab
  - value_score DESC for value tab
  - player_id for join lookups

  ## Notes
  - All new columns are nullable to allow incremental population
  - Existing data is preserved (no destructive operations)
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'team_name') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN team_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'position_group') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN position_group text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'projection') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN projection double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'ceiling') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN ceiling double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'floor') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN floor double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'consistency') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN consistency double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'form_score') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN form_score double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'matchup_rating') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN matchup_rating text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'upside_rating') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN upside_rating double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'captain_score') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN captain_score double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'ai_summary') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN ai_summary text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'ai_updated_at') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN ai_updated_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'recommendation_short') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN recommendation_short text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'recommendation_color') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN recommendation_color text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'value_tag') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN value_tag text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'value_tier') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN value_tier text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'consistency_tier') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN consistency_tier text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'total_count') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN total_count integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'cached_at') THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN cached_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Composite index for position-filtered neeko_rating sort (most common query)
CREATE INDEX IF NOT EXISTS idx_rankings_cache_pos_rating
  ON afl.player_rankings_cache (position, neeko_rating DESC NULLS LAST);

-- Index for projection tab sort
CREATE INDEX IF NOT EXISTS idx_rankings_cache_projection
  ON afl.player_rankings_cache (projection_final DESC NULLS LAST);

-- Index for value tab sort
CREATE INDEX IF NOT EXISTS idx_rankings_cache_value
  ON afl.player_rankings_cache (value_score DESC NULLS LAST);

-- Index for player_id lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_rankings_cache_player_id
  ON afl.player_rankings_cache (player_id);
