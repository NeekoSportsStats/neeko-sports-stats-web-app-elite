/*
  # Create start_sit_cache table

  ## Summary
  Replaces the old afl_ai_start_sit table concept with a properly designed
  cache table that:
  - Canonicalises player ordering (low/high IDs) so A-vs-B and B-vs-A share one row
  - Uses an inputs_hash to invalidate cache when underlying stats change
  - Stores both the deterministic winner AND the nullable AI narrative separately
  - RLS: anyone can read; only service role (edge function) can write

  ## New Tables
  ### public.start_sit_cache
  - id: uuid primary key
  - season: int (e.g. 2026)
  - round_number: int (1-24, or 0 for opening round)
  - player_low_id: text (lexicographically lower player_id)
  - player_high_id: text (lexicographically higher player_id)
  - winner_player_id: text (the deterministic winner's player_id)
  - winner_name: text
  - confidence: int 0-100
  - ai_summary: text nullable (premium narrative)
  - model_key: text nullable (e.g. gpt-4o-mini)
  - inputs_hash: text (sha256 of input payload JSON)
  - created_at: timestamptz

  ## Unique constraint
  (season, round_number, player_low_id, player_high_id, inputs_hash)
  — hash-keyed so stats changes auto-bust the cache

  ## Security
  - RLS enabled
  - anon + authenticated: SELECT only
  - No INSERT/UPDATE policy for non-service-role (edge function uses service role key)
*/

CREATE TABLE IF NOT EXISTS public.start_sit_cache (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season           int         NOT NULL,
  round_number     int         NOT NULL,
  player_low_id    text        NOT NULL,
  player_high_id   text        NOT NULL,
  winner_player_id text        NOT NULL,
  winner_name      text        NOT NULL,
  confidence       int         NOT NULL DEFAULT 60,
  ai_summary       text        NULL,
  model_key        text        NULL,
  inputs_hash      text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS start_sit_cache_lookup_idx
  ON public.start_sit_cache (season, round_number, player_low_id, player_high_id, inputs_hash);

CREATE INDEX IF NOT EXISTS start_sit_cache_pair_idx
  ON public.start_sit_cache (season, round_number, player_low_id, player_high_id);

ALTER TABLE public.start_sit_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read start sit cache"
  ON public.start_sit_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
