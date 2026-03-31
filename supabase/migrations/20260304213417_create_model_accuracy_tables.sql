/*
  # Create Model Accuracy & Calibration Tables

  ## Summary
  Implements a full model evaluation system to track and measure:
  - Player projection accuracy vs actual AFL fantasy scores
  - Start/Sit prediction accuracy (did the predicted winner actually win?)
  - Confidence calibration (are 70%-confidence picks right ~70% of the time?)

  ## New Tables

  ### 1. public.player_round_scores
  Stores actual fantasy scores after each round completes. This is the
  ground-truth input for all evaluation functions.
  - player_id (integer, FK-style reference)
  - season, round_number — composite PK with player_id
  - fantasy_score — the real AFL Fantasy points scored

  ### 2. public.projection_accuracy
  Computed after each round. Compares model projection to actual score.
  - error = projection - actual_score
  - abs_error = ABS(error)
  - within_10 = abs_error <= 10 (±10 point tolerance band)

  ### 3. public.start_sit_results
  Records the outcome of every Start/Sit decision after actual scores arrive.
  - predicted_winner_id vs actual_winner_id
  - correct_prediction = predicted_winner_id = actual_winner_id

  ### 4. public.start_sit_calibration
  Aggregated confidence buckets. Measures whether confidence % matches
  real-world accuracy. E.g., 70%-confidence picks should win ~70% of the time.
  - confidence_bucket: floor(confidence / 10) * 10 (e.g., 67 → 60)
  - predictions, correct, accuracy

  ## Security
  - RLS enabled on all tables
  - Public read allowed (admin dashboard reads without auth context)
  - Insert/Update restricted to service_role

  ## Notes
  - All tables are in the public schema to match existing patterns
  - round_number = 0 is Opening Round (supported by design)
  - Evaluation functions are created in a separate migration
*/

-- ─── 1. player_round_scores ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_round_scores (
  player_id    integer      NOT NULL,
  season       integer      NOT NULL,
  round_number integer      NOT NULL CHECK (round_number >= 0 AND round_number <= 28),
  fantasy_score numeric(6,2) NOT NULL DEFAULT 0,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT player_round_scores_pkey PRIMARY KEY (player_id, season, round_number)
);

ALTER TABLE public.player_round_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read player round scores"
  ON public.player_round_scores
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert player round scores"
  ON public.player_round_scores
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update player round scores"
  ON public.player_round_scores
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 2. projection_accuracy ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projection_accuracy (
  player_id    integer      NOT NULL,
  season       integer      NOT NULL,
  round_number integer      NOT NULL CHECK (round_number >= 0 AND round_number <= 28),
  projection   numeric(6,2),
  actual_score numeric(6,2),
  error        numeric(6,2),
  abs_error    numeric(6,2),
  within_10    boolean      DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT projection_accuracy_pkey PRIMARY KEY (player_id, season, round_number)
);

ALTER TABLE public.projection_accuracy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read projection accuracy"
  ON public.projection_accuracy
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert projection accuracy"
  ON public.projection_accuracy
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update projection accuracy"
  ON public.projection_accuracy
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 3. start_sit_results ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.start_sit_results (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  season               integer      NOT NULL,
  round_number         integer      NOT NULL CHECK (round_number >= 0 AND round_number <= 28),
  player_low_id        integer      NOT NULL,
  player_high_id       integer      NOT NULL,
  predicted_winner_id  integer,
  actual_winner_id     integer,
  confidence           numeric(5,2),
  correct_prediction   boolean      DEFAULT false,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT start_sit_results_unique UNIQUE (season, round_number, player_low_id, player_high_id)
);

ALTER TABLE public.start_sit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read start sit results"
  ON public.start_sit_results
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert start sit results"
  ON public.start_sit_results
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update start sit results"
  ON public.start_sit_results
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 4. start_sit_calibration ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.start_sit_calibration (
  confidence_bucket integer PRIMARY KEY,
  predictions       integer NOT NULL DEFAULT 0,
  correct           integer NOT NULL DEFAULT 0,
  accuracy          numeric(5,4),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.start_sit_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration"
  ON public.start_sit_calibration
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert calibration"
  ON public.start_sit_calibration
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update calibration"
  ON public.start_sit_calibration
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed calibration buckets so they always exist (even before data arrives)
INSERT INTO public.start_sit_calibration (confidence_bucket, predictions, correct, accuracy)
VALUES
  (50, 0, 0, NULL),
  (60, 0, 0, NULL),
  (70, 0, 0, NULL),
  (80, 0, 0, NULL),
  (90, 0, 0, NULL),
  (100, 0, 0, NULL)
ON CONFLICT (confidence_bucket) DO NOTHING;
