
/*
  # Create afl.opponent_position_venue_concession table

  ## Summary
  Derived table that stores how many fantasy points each opponent team concedes
  to each position group at each venue. This adds venue context on top of the
  existing position-only concession model (player_opponent_concession), giving
  a more precise matchup signal for away vs home environments.

  ## New Table: afl.opponent_position_venue_concession
  - opponent_team_id            — the defending team (team conceding points)
  - venue                       — the venue where the game was played
  - position_group              — attacking position group (MID, FWD, DEF, RUC)
  - games_sample                — number of games in the sample at this venue
  - fantasy_points_allowed      — average fantasy points conceded per game at venue
  - league_avg_position_points  — league-wide avg for that position at that venue
  - concession_index            — fantasy_points_allowed / league_avg (1.10 = generous, 0.92 = tough)
  - concession_multiplier       — clamped to [0.94, 1.06] for projection safety
  - updated_at

  ## Primary Key
  (opponent_team_id, venue, position_group) — one row per team/venue/position combo

  ## Security
  - RLS enabled; service role full access, authenticated read-only
*/

CREATE TABLE IF NOT EXISTS afl.opponent_position_venue_concession (
  opponent_team_id           integer     NOT NULL,
  venue                      text        NOT NULL,
  position_group             text        NOT NULL,
  games_sample               integer     NOT NULL DEFAULT 0,
  fantasy_points_allowed     numeric(8,2),
  league_avg_position_points numeric(8,2),
  concession_index           numeric(6,4),
  concession_multiplier      numeric(6,4) NOT NULL DEFAULT 1.0,
  updated_at                 timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT opponent_position_venue_concession_pkey
    PRIMARY KEY (opponent_team_id, venue, position_group)
);

ALTER TABLE afl.opponent_position_venue_concession ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to opponent_position_venue_concession"
  ON afl.opponent_position_venue_concession
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read opponent_position_venue_concession"
  ON afl.opponent_position_venue_concession
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_opvc_multiplier
  ON afl.opponent_position_venue_concession (concession_multiplier DESC);

CREATE INDEX IF NOT EXISTS idx_opvc_team_venue
  ON afl.opponent_position_venue_concession (opponent_team_id, venue);
