/*
  # Create ai_rankings_player_recos table

  Stores per-player AI ranking recommendations keyed by season + round_number + player_id.

  ## New Tables
  - `public.ai_rankings_player_recos`
    - `season` (int) — AFL season year
    - `round_number` (int) — round this reco applies to
    - `player_id` (bigint) — joins to v_rankings_premium.player_id
    - `player_name` (text)
    - `team` (text)
    - `position` (text)
    - `recommendation_label` (text) — short display label for the rankings column
    - `recommendation_short` (text) — 1–2 sentence summary
    - `recommendation_long` (text) — overlay analysis, 120–220 words
    - `confidence_pct` (numeric) — 0–100, optional
    - `generated_at` (timestamptz)
    - `model` (text)
    - `prompt_key` (text)
    - `input_hash` (text) — md5 of payload used; used for skip-if-unchanged logic

  ## Security
  - RLS enabled; read-only for authenticated + anon (premium gating handled in app layer)
  - No write policies (server-only writes via SECURITY DEFINER functions)

  ## Indexes
  - PK on (season, round_number, player_id)
  - Index on input_hash for dedup checks
*/

CREATE TABLE IF NOT EXISTS public.ai_rankings_player_recos (
  season             int          NOT NULL,
  round_number       int          NOT NULL,
  player_id          bigint       NOT NULL,
  player_name        text         NOT NULL,
  team               text         NOT NULL,
  "position"         text,
  recommendation_label text,
  recommendation_short text,
  recommendation_long  text,
  confidence_pct     numeric,
  generated_at       timestamptz  NOT NULL DEFAULT now(),
  model              text,
  prompt_key         text,
  input_hash         text         NOT NULL,
  CONSTRAINT ai_rankings_player_recos_pkey PRIMARY KEY (season, round_number, player_id)
);

CREATE INDEX IF NOT EXISTS ai_rankings_player_recos_season_round_idx
  ON public.ai_rankings_player_recos (season, round_number);

CREATE INDEX IF NOT EXISTS ai_rankings_player_recos_hash_idx
  ON public.ai_rankings_player_recos (input_hash);

ALTER TABLE public.ai_rankings_player_recos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rankings recos readable by all authenticated users"
  ON public.ai_rankings_player_recos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Rankings recos readable by anon"
  ON public.ai_rankings_player_recos
  FOR SELECT
  TO anon
  USING (true);
