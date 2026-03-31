/*
  # Create afl_ai_start_sit cache table

  ## Purpose
  Stores cached AI Start/Sit verdicts so the same player pair + round
  does not re-call OpenAI on subsequent requests.

  ## New Tables
  - `afl_ai_start_sit`
    - `id`              (uuid, pk)
    - `player_a_id`     (text) — always the lower of the two IDs
    - `player_b_id`     (text) — always the higher of the two IDs
    - `season`          (integer)
    - `round`           (integer)
    - `verdict`         (text)  — 'START_PLAYER_A' | 'START_PLAYER_B' | 'TOSS_UP'
    - `confidence`      (integer, 0-100)
    - `analysis`        (text)
    - `player_a_name`   (text)
    - `player_b_name`   (text)
    - `created_at`      (timestamptz)

  ## Security
  - RLS enabled; authenticated users can read all rows (public cache).
  - Only the service role (edge function) can insert / update via RLS bypass.
*/

CREATE TABLE IF NOT EXISTS afl_ai_start_sit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_a_id  text NOT NULL,
  player_b_id  text NOT NULL,
  season       integer NOT NULL,
  round        integer NOT NULL,
  verdict      text NOT NULL,
  confidence   integer,
  analysis     text,
  player_a_name text,
  player_b_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_a_id, player_b_id, season, round)
);

ALTER TABLE afl_ai_start_sit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read start sit verdicts"
  ON afl_ai_start_sit FOR SELECT
  TO anon, authenticated
  USING (true);
