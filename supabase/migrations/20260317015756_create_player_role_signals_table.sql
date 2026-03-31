
/*
  # Create afl.player_role_signals table

  ## Summary
  Derived table that detects player role changes using stat pattern shifts
  across kicks, tackles, and marks — comparing last 5 games vs season average.

  ## New Table: afl.player_role_signals
  - player_id             — FK to afl.players
  - games_sample          — total games with data used
  - kick_rate_last5       — avg kicks per game over last 5 games
  - kick_rate_season      — avg kicks per game over full season
  - tackle_rate_last5     — avg tackles per game over last 5 games
  - tackle_rate_season    — avg tackles per game over full season
  - mark_rate_last5       — avg marks per game over last 5 games
  - mark_rate_season      — avg marks per game over full season
  - usage_change_index    — sum of absolute deltas across all three rates
  - role_change_score     — clamp(usage_change_index * 10, 0, 100)
  - role_change_flag      — TRUE when role_change_score > 25
  - updated_at            — last computed timestamp

  ## Security
  - RLS enabled; service role full access, authenticated users read-only
*/

CREATE TABLE IF NOT EXISTS afl.player_role_signals (
  player_id            integer      NOT NULL,
  games_sample         integer      NOT NULL DEFAULT 0,
  kick_rate_last5      numeric(6,2),
  kick_rate_season     numeric(6,2),
  tackle_rate_last5    numeric(6,2),
  tackle_rate_season   numeric(6,2),
  mark_rate_last5      numeric(6,2),
  mark_rate_season     numeric(6,2),
  usage_change_index   numeric(6,2) NOT NULL DEFAULT 0,
  role_change_score    numeric(6,2) NOT NULL DEFAULT 0,
  role_change_flag     boolean      NOT NULL DEFAULT false,
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT player_role_signals_pkey PRIMARY KEY (player_id)
);

ALTER TABLE afl.player_role_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to player_role_signals"
  ON afl.player_role_signals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read player_role_signals"
  ON afl.player_role_signals
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_player_role_signals_flag
  ON afl.player_role_signals (role_change_flag)
  WHERE role_change_flag = true;

CREATE INDEX IF NOT EXISTS idx_player_role_signals_score
  ON afl.player_role_signals (role_change_score DESC);
