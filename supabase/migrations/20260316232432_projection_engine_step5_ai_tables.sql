/*
  # Projection Engine Rebuild — Step 5: AI Tables

  ## Purpose
  Two tables in the ai schema supporting the AI generation pipeline.

  ### ai.player_prompt_inputs
  Pre-assembled input rows for LLM prompt generation.
  Populated from afl.mv_player_projection.
  input_hash enables change detection — AI is only regenerated when data changes.

  ### ai.player_ai_analysis
  AI-generated output per player.
  Keyed on player_id + input_hash so stale outputs can be detected.

  ## Notes
  - All joins use player_id only.
  - player_name and team_name are denormalised for prompt assembly convenience.
  - input_hash = md5 of projection + key features (change detection).

  ## Security
  - RLS enabled on both tables.
  - service_role can write; authenticated + anon can read.
*/

-- ─────────────────────────────────────────
-- ai.player_prompt_inputs
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai.player_prompt_inputs (
  player_id          integer       NOT NULL,
  player_name        text,
  team_name          text,
  position           text,
  price              integer,
  projection         numeric(6,2),
  ceiling            integer,
  floor              numeric(6,2),
  risk               text,
  confidence         numeric(5,1),
  consistency        numeric(5,1),
  value_score        numeric(8,4),
  matchup_rating     numeric(6,3),
  venue_multiplier   numeric(6,4),
  rest_days          numeric(4,1),
  form_score         numeric(6,2),
  form_momentum      numeric(6,2),
  neeko_rating       numeric(5,1),
  input_hash         text,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT player_prompt_inputs_pkey PRIMARY KEY (player_id)
);

CREATE INDEX IF NOT EXISTS idx_ppi_input_hash ON ai.player_prompt_inputs (input_hash);

ALTER TABLE ai.player_prompt_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages player_prompt_inputs"
  ON ai.player_prompt_inputs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read player_prompt_inputs"
  ON ai.player_prompt_inputs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read player_prompt_inputs"
  ON ai.player_prompt_inputs FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- ai.player_ai_analysis
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai.player_ai_analysis (
  player_id        integer       NOT NULL,
  recommendation   text,
  summary_short    text,
  summary_long     text,
  confidence       numeric(5,1),
  generated_at     timestamptz,
  model            text,
  input_hash       text,
  CONSTRAINT player_ai_analysis_pkey PRIMARY KEY (player_id)
);

CREATE INDEX IF NOT EXISTS idx_paa_input_hash    ON ai.player_ai_analysis (input_hash);
CREATE INDEX IF NOT EXISTS idx_paa_generated_at  ON ai.player_ai_analysis (generated_at DESC);

ALTER TABLE ai.player_ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages player_ai_analysis"
  ON ai.player_ai_analysis FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read player_ai_analysis"
  ON ai.player_ai_analysis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read player_ai_analysis"
  ON ai.player_ai_analysis FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- Populate player_prompt_inputs from mv_player_projection
-- input_hash = md5 of key fields that should trigger AI regen when changed
-- ─────────────────────────────────────────
INSERT INTO ai.player_prompt_inputs (
  player_id,
  player_name,
  team_name,
  position,
  price,
  projection,
  ceiling,
  floor,
  risk,
  confidence,
  consistency,
  value_score,
  matchup_rating,
  venue_multiplier,
  rest_days,
  form_score,
  form_momentum,
  neeko_rating,
  input_hash,
  created_at
)
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.position,
  mv.price,
  mv.projection,
  mv.ceiling,
  mv.floor,
  mv.risk,
  mv.confidence,
  mv.consistency,
  mv.value_score,
  mv.matchup_rating,
  mv.venue_multiplier,
  mv.rest_days,
  mv.form_score,
  mv.form_momentum,
  mv.neeko_rating,
  md5(
    COALESCE(mv.projection::text,    '') ||
    COALESCE(mv.ceiling::text,       '') ||
    COALESCE(mv.floor::text,         '') ||
    COALESCE(mv.matchup_rating::text,'') ||
    COALESCE(mv.price::text,         '') ||
    COALESCE(mv.form_score::text,    '') ||
    COALESCE(mv.neeko_rating::text,  '')
  ) AS input_hash,
  now()
FROM afl.mv_player_projection mv
ON CONFLICT (player_id) DO UPDATE SET
  player_name      = EXCLUDED.player_name,
  team_name        = EXCLUDED.team_name,
  position         = EXCLUDED.position,
  price            = EXCLUDED.price,
  projection       = EXCLUDED.projection,
  ceiling          = EXCLUDED.ceiling,
  floor            = EXCLUDED.floor,
  risk             = EXCLUDED.risk,
  confidence       = EXCLUDED.confidence,
  consistency      = EXCLUDED.consistency,
  value_score      = EXCLUDED.value_score,
  matchup_rating   = EXCLUDED.matchup_rating,
  venue_multiplier = EXCLUDED.venue_multiplier,
  rest_days        = EXCLUDED.rest_days,
  form_score       = EXCLUDED.form_score,
  form_momentum    = EXCLUDED.form_momentum,
  neeko_rating     = EXCLUDED.neeko_rating,
  input_hash       = EXCLUDED.input_hash,
  created_at       = now();
