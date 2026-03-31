/*
  # Rebuild ai_rankings_player_recos with player_id as sole PK and updated_at

  ## Summary
  The previous schema used a composite PK (season, round_number, player_id).
  This rebuild changes it to player_id as the sole PK, adding updated_at for
  staleness-based regeneration queuing (regenerate if updated_at > 3 days old).

  ## Changes
  1. Drops existing ai_rankings_player_recos table
  2. Recreates with player_id BIGINT PRIMARY KEY
  3. Adds updated_at column for staleness tracking
  4. Adds index on updated_at for queue ordering
  5. Preserves RLS with read-only anon + authenticated policies

  ## New Columns
  - player_id: sole primary key (bigint)
  - season: int
  - recommendation_label: text (one of 6 valid labels)
  - recommendation_short: text (1-2 sentences)
  - recommendation_long: text (120-220 word analysis)
  - generated_at: timestamptz (first generation)
  - updated_at: timestamptz (last upsert, used for staleness check)

  ## Security
  - RLS enabled
  - SELECT allowed for authenticated and anon
  - No INSERT/UPDATE/DELETE from client side
*/

DROP TABLE IF EXISTS public.ai_rankings_player_recos CASCADE;

CREATE TABLE public.ai_rankings_player_recos (
  player_id             bigint       NOT NULL,
  season                int          NOT NULL DEFAULT 2026,
  recommendation_label  text,
  recommendation_short  text,
  recommendation_long   text,
  generated_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ai_rankings_player_recos_pkey PRIMARY KEY (player_id)
);

CREATE INDEX idx_ai_rankings_player_recos_stale
  ON public.ai_rankings_player_recos (updated_at);

ALTER TABLE public.ai_rankings_player_recos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rankings AI recos"
  ON public.ai_rankings_player_recos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read rankings AI recos"
  ON public.ai_rankings_player_recos
  FOR SELECT
  TO anon
  USING (true);
