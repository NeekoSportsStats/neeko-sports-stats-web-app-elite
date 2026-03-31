/*
  # Projection Engine Rebuild — Step 1: Feature Tables

  ## Purpose
  Replace stacked view-on-view projection logic with dedicated, independently
  populated feature tables. Each table derives only from canonical tables.
  No synthetic values are created. NULL is used where data is unavailable.

  ## New Tables

  ### afl.feature_player_form
  - Form metrics per player derived from afl.player_games.fantasy_score
  - season_avg, last3/5/10 averages, ceiling (p85), floor (p15), volatility, consistency, form_score, form_momentum

  ### afl.feature_matchup
  - Opponent matchup difficulty per player keyed to player_id + opponent_team_id + position_group
  - matchup_rating = blended avg points allowed / league avg (0.85 season + 0.15 last-5)
  - opponent_rank_vs_position = rank within position group (1 = hardest)

  ### afl.feature_venue
  - Venue scoring adjustment per player keyed to player_id + venue
  - venue_multiplier clamped [0.92, 1.08], home_advantage from team-level delta

  ### afl.feature_rest
  - Rest days between games per player (inherits from team, joined via player_games)
  - short_turnaround_flag = true when rest_days <= 6

  ### afl.feature_travel
  - Travel fatigue placeholder. travel_km left NULL (no distance data in canonical tables).
  - interstate_flag and travel_penalty populated from known state mappings where possible.

  ### afl.feature_price
  - Fantasy price per player from afl.player_prices (latest)
  - value_score = projection / price, NULL when price is NULL

  ### afl.feature_position
  - Manual position import table. Positions are NOT inferred.
  - is_primary marks the primary position when a player has multiple.

  ## Security
  - RLS enabled on all tables
  - Service role can write; authenticated users can read; anon read via explicit policy
*/

-- ─────────────────────────────────────────
-- feature_player_form
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_player_form (
  player_id            integer      NOT NULL,
  games_played         integer      NOT NULL DEFAULT 0,
  season_avg           numeric(6,2),
  last3_avg            numeric(6,2),
  last5_avg            numeric(6,2),
  last10_avg           numeric(6,2),
  ceiling              integer,
  floor                integer,
  volatility           numeric(6,2),
  consistency          numeric(5,1),
  form_score           numeric(6,2),
  form_momentum        numeric(6,2),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_player_form_pkey PRIMARY KEY (player_id)
);

ALTER TABLE afl.feature_player_form ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_player_form"
  ON afl.feature_player_form FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_player_form"
  ON afl.feature_player_form FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_player_form"
  ON afl.feature_player_form FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- feature_matchup
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_matchup (
  player_id                  integer      NOT NULL,
  opponent_team_id           integer      NOT NULL,
  position_group             text         NOT NULL,
  matchup_rating             numeric(6,3),
  opponent_rank_vs_position  integer,
  updated_at                 timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_matchup_pkey PRIMARY KEY (player_id, opponent_team_id, position_group)
);

ALTER TABLE afl.feature_matchup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_matchup"
  ON afl.feature_matchup FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_matchup"
  ON afl.feature_matchup FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_matchup"
  ON afl.feature_matchup FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- feature_venue
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_venue (
  player_id         integer      NOT NULL,
  venue             text         NOT NULL,
  venue_multiplier  numeric(6,4) NOT NULL DEFAULT 1.0,
  home_advantage    numeric(6,2),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_venue_pkey PRIMARY KEY (player_id, venue)
);

ALTER TABLE afl.feature_venue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_venue"
  ON afl.feature_venue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_venue"
  ON afl.feature_venue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_venue"
  ON afl.feature_venue FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- feature_rest
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_rest (
  player_id               integer      NOT NULL,
  game_id                 integer      NOT NULL,
  rest_days               numeric(4,1),
  short_turnaround_flag   boolean      NOT NULL DEFAULT false,
  updated_at              timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_rest_pkey PRIMARY KEY (player_id, game_id)
);

ALTER TABLE afl.feature_rest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_rest"
  ON afl.feature_rest FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_rest"
  ON afl.feature_rest FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_rest"
  ON afl.feature_rest FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- feature_travel
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_travel (
  player_id         integer      NOT NULL,
  game_id           integer      NOT NULL,
  travel_km         numeric(8,1),
  interstate_flag   boolean      NOT NULL DEFAULT false,
  travel_penalty    numeric(5,4) NOT NULL DEFAULT 0.0,
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_travel_pkey PRIMARY KEY (player_id, game_id)
);

ALTER TABLE afl.feature_travel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_travel"
  ON afl.feature_travel FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_travel"
  ON afl.feature_travel FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_travel"
  ON afl.feature_travel FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- feature_price
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_price (
  player_id    integer      NOT NULL,
  price        integer,
  value_score  numeric(8,4),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_price_pkey PRIMARY KEY (player_id)
);

ALTER TABLE afl.feature_price ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_price"
  ON afl.feature_price FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_price"
  ON afl.feature_price FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_price"
  ON afl.feature_price FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- feature_position
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS afl.feature_position (
  player_id   integer  NOT NULL,
  position    text     NOT NULL,
  is_primary  boolean  NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_position_pkey PRIMARY KEY (player_id, position)
);

ALTER TABLE afl.feature_position ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages feature_position"
  ON afl.feature_position FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users read feature_position"
  ON afl.feature_position FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users read feature_position"
  ON afl.feature_position FOR SELECT
  TO anon
  USING (true);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feature_matchup_player_id    ON afl.feature_matchup (player_id);
CREATE INDEX IF NOT EXISTS idx_feature_matchup_opponent     ON afl.feature_matchup (opponent_team_id, position_group);
CREATE INDEX IF NOT EXISTS idx_feature_venue_player_id      ON afl.feature_venue (player_id);
CREATE INDEX IF NOT EXISTS idx_feature_rest_player_id       ON afl.feature_rest (player_id);
CREATE INDEX IF NOT EXISTS idx_feature_rest_game_id         ON afl.feature_rest (game_id);
CREATE INDEX IF NOT EXISTS idx_feature_travel_player_id     ON afl.feature_travel (player_id);
CREATE INDEX IF NOT EXISTS idx_feature_position_player_id   ON afl.feature_position (player_id);
